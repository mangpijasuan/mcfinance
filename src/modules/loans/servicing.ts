// Daily loan servicing (docs/architecture/04 §2). For every loan on the
// loan engine, as of a date:
//
// 1. Late fees: installments unpaid more than the grace days get a fee,
//    at most once each. Charging is switched off (LATE_FEES_ENABLED) until
//    counsel confirms the state's limits (Gate #1 A7); until then the job
//    only reports the fees that would have been charged.
// 2. Delinquency: current / delinquent and days past due, computed from
//    the schedule. Never set by hand (F-6, F-12).
// 3. Ledger: posts anything recorded but not yet posted, once the chart of
//    accounts is approved.
//
// Each loan is handled in its own transaction with the loan row locked,
// so the job can run while staff record payments. Running it twice for
// the same date changes nothing the second time.
import { prisma } from '@/lib/prisma'
import { type IsoDate, dateOnly, todayIso } from '@/lib/dates'
import { cents, formatUSD } from '@/lib/money'
import { systemAuditContext, recordAudit } from '@/modules/audit'
import { DEFAULT_GRACE_DAYS, lateFeesDue } from './amortization'
import { LATE_FEE_CENTS, chargeLateFees, lateFeesEnabled } from './lifecycle'
import { loadLoan, loanState, refreshLoan } from './state'
import { postPendingLoanEntries } from './postings'

export type ServicingReport = {
  asOf: IsoDate
  dryRun: boolean
  lateFeesEnabled: boolean
  loansChecked: number
  delinquent: { loanId: string; borrower: string; daysPastDue: number; overdue: string }[]
  changes: { loanId: string; from: string | null; to: string | null }[]
  feesCharged: { loanId: string; feeIds: string[] }[]
  /** With charging switched off: the fees that would have been charged. */
  feesNotCharged: { loanId: string; installments: number[]; amount: string }[]
  journalEntries: string[]
  errors: { loanId: string; error: string }[]
}

class DryRunRollback extends Error {}

export async function serviceLoans(opts: { asOf?: IsoDate; dryRun?: boolean; chargeFees?: boolean } = {}): Promise<ServicingReport> {
  const asOf = opts.asOf ?? todayIso()
  const dryRun = opts.dryRun ?? false
  const chargeFees = opts.chargeFees ?? lateFeesEnabled()
  const ctx = systemAuditContext('loan-servicing')
  const report: ServicingReport = {
    asOf, dryRun, lateFeesEnabled: chargeFees, loansChecked: 0,
    delinquent: [], changes: [], feesCharged: [], feesNotCharged: [], journalEntries: [], errors: [],
  }

  const loans = await prisma.loan.findMany({
    where: { principalCents: { not: null }, lifecycle: { in: ['disbursed', 'paid_off', 'charged_off'] } },
    select: { loanId: true },
    orderBy: { loanId: 'asc' },
  })

  for (const { loanId } of loans) {
    const found: Pick<ServicingReport, 'delinquent' | 'changes' | 'feesCharged' | 'feesNotCharged' | 'journalEntries'> = {
      delinquent: [], changes: [], feesCharged: [], feesNotCharged: [], journalEntries: [],
    }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Loan" WHERE "loanId" = ${loanId} FOR UPDATE`
        const loan = (await loadLoan(tx, loanId))!
        if (loan.lifecycle === 'disbursed') {
          const due = lateFeesDue(loanState(loan, asOf).position, asOf, {
            graceDays: loan.graceDays ?? DEFAULT_GRACE_DAYS,
            alreadyCharged: loan.fees.map((f) => f.installmentNumber),
          })
          if (due.length > 0 && chargeFees) {
            const feeIds = await chargeLateFees(tx, loanId, due, asOf)
            if (feeIds.length > 0) {
              found.feesCharged.push({ loanId, feeIds })
              await recordAudit(tx, ctx, {
                action: 'loan.fee.charge', entityType: 'loan', entityId: loanId,
                metadata: { asOf, installments: due, feeIds, amountCentsEach: LATE_FEE_CENTS },
              })
            }
          } else if (due.length > 0) {
            found.feesNotCharged.push({ loanId, installments: due, amount: formatUSD(cents(LATE_FEE_CENTS * due.length)) })
          }

          const { state, before, after } = await refreshLoan(tx, loanId, asOf)
          await tx.loan.update({ where: { loanId }, data: { servicedOn: dateOnly(asOf) } })
          if (before.delinquency !== after.delinquency || before.lifecycle !== after.lifecycle) {
            found.changes.push({ loanId, from: before.delinquency ?? before.lifecycle, to: after.delinquency ?? after.lifecycle })
            await recordAudit(tx, ctx, {
              action: 'loan.delinquency.change', entityType: 'loan', entityId: loanId, before, after,
              metadata: { asOf, overdueInstallments: state.delinquency.overdueInstallments },
            })
          }
          if (after.delinquency === 'delinquent') {
            found.delinquent.push({
              loanId, borrower: loan.borrowerName, daysPastDue: after.daysPastDue, overdue: formatUSD(state.delinquency.overdueAmount),
            })
          }
        }
        const posted = await postPendingLoanEntries(tx, loanId)
        if (posted.length > 0) {
          found.journalEntries.push(...posted)
          await recordAudit(tx, ctx, { action: 'loan.ledger.post', entityType: 'loan', entityId: loanId, metadata: { journalEntries: posted } })
        }
        if (dryRun) throw new DryRunRollback()
      })
    } catch (err) {
      if (!(err instanceof DryRunRollback)) {
        report.errors.push({ loanId, error: err instanceof Error ? err.message : String(err) })
        continue
      }
    }
    report.loansChecked++
    report.delinquent.push(...found.delinquent)
    report.changes.push(...found.changes)
    report.feesCharged.push(...found.feesCharged)
    report.feesNotCharged.push(...found.feesNotCharged)
    report.journalEntries.push(...found.journalEntries)
  }
  return report
}
