// Contributions (docs/architecture/04 §1): dues plans, monthly obligations,
// payments with numbered receipts, corrections by reversal, and ledger
// postings (Dr cash / Cr 2000 Member capital) once the chart is approved.
//
// Obligations exist only while a member is active. They are created up to
// the current month whenever the member's dues are synced: on every
// payment, and by the daily job (npm run dues:service) so a new month
// starts unpaid for everyone who has not prepaid.
import type { Prisma } from '@prisma/client'
import { type Cents, formatUSD, fromBigInt, fromLegacyDollars, subtract, sum, toBigInt, toLegacyDollars } from '@/lib/money'
import { type IsoDate, clubDateOf, dateOnly, isoDateOf, todayIso } from '@/lib/dates'
import { nextPublicId } from '@/lib/publicIds'
import { prisma } from '@/lib/prisma'
import { OperationError } from '@/lib/operationError'
import { type AuditContext, recordAudit } from '@/modules/audit'
import type { Actors } from '@/modules/approvals/actors'
import { ledgerOpening, postWhenChartApproved, receiptAccount } from '@/modules/accounting/autoPost'
import { reverseEntry } from '@/modules/accounting/ledger'
import { postLegacyActivity } from '@/modules/accounting/legacyActivity'
import {
  type Period, type PlanRow, addPeriods, coveredThrough, duesStatus, laterPeriod, periodLabel, periodOf, periodRangeLabel, periodsBetween, planAmountFor,
} from './dues'

type Tx = Prisma.TransactionClient

/** The default plan: $20 a month (the amount in the reminder email and the club's practice). */
export const DEFAULT_MONTHLY_DUES_CENTS = 2000
/**
 * The first month dues are tracked month by month: where transaction-level
 * records begin (earlier years exist only as yearly totals, F-9), matching
 * the proposed ledger cutover (M4). A member who joined later starts in
 * their joining month.
 */
export function duesTrackingStart(): Period {
  return process.env.DUES_TRACKING_START || '2026-01'
}

export const MEMBER_CAPITAL_ACCOUNT = '2000'

const planRows = (plans: { startPeriod: string; amountCents: bigint }[]): PlanRow[] =>
  plans.map((p) => ({ startPeriod: p.startPeriod, amount: fromBigInt(p.amountCents) }))

async function plansFor(tx: Tx, member: { id: string; joinDate: Date }) {
  const existing = await tx.duesPlan.findMany({ where: { memberId: member.id }, orderBy: { startPeriod: 'asc' } })
  if (existing.length > 0) return existing
  const startPeriod = laterPeriod(duesTrackingStart(), periodOf(isoDateOf(member.joinDate)))
  await tx.duesPlan.createMany({
    data: [{ memberId: member.id, amountCents: BigInt(DEFAULT_MONTHLY_DUES_CENTS), startPeriod, note: 'Default plan' }],
    skipDuplicates: true,
  })
  return tx.duesPlan.findMany({ where: { memberId: member.id }, orderBy: { startPeriod: 'asc' } })
}

/**
 * Create any missing obligations up to the current month (while active),
 * then refresh the member's summary fields from what was actually paid.
 */
export async function syncMemberDues(tx: Tx, memberId: string, asOf: IsoDate = todayIso()) {
  const member = await tx.member.findUnique({
    where: { id: memberId },
    select: { id: true, status: true, joinDate: true, duesThrough: true, archiveLifetime: true, thisMonth: true },
  })
  if (!member) throw new OperationError(404, 'Member not found')
  const current = periodOf(asOf)
  const plans = await plansFor(tx, member)
  const rows = planRows(plans)
  const from = member.duesThrough ? addPeriods(member.duesThrough, 1) : plans[0].startPeriod

  let created = 0
  if (from <= current) {
    if (member.status === 'Active') created = await bill(tx, memberId, from, current, rows)
    await tx.member.update({ where: { id: memberId }, data: { duesThrough: current } })
  }

  const view = await memberDues(tx, memberId, current, rows)
  const all = await tx.contribution.findMany({
    where: { memberId, reversedAt: null },
    select: { amount: true, paymentDate: true },
    orderBy: { paymentDate: 'desc' },
  })
  const paidTotal = toLegacyDollars(sum(all.map((c) => fromLegacyDollars(c.amount))))
  const thisMonth = view.status.currentPaid ? 'PAID' : 'NOT PAID'
  await tx.member.update({
    where: { id: memberId },
    data: {
      contributions2026: paidTotal,
      overallContributions: member.archiveLifetime + paidTotal,
      lastContributionDate: all[0]?.paymentDate ?? null,
      thisMonth,
    },
  })
  return { ...view, created, thisMonthBefore: member.thisMonth, thisMonth }
}

/** Create the obligations for these months (skipping $0 plan months and any that exist). */
async function bill(tx: Tx, memberId: string, from: Period, to: Period, rows: PlanRow[]): Promise<number> {
  const data = periodsBetween(from, to).flatMap((period) => {
    const amount = planAmountFor(rows, period)
    return amount ? [{ memberId, period, amountCents: toBigInt(amount) }] : []
  })
  return (await tx.duesObligation.createMany({ data, skipDuplicates: true })).count
}

/** The member's dues position as of a month (read only). */
export async function memberDues(tx: Pick<Tx, 'duesObligation' | 'contribution' | 'duesPlan'>, memberId: string, current: Period, plans?: PlanRow[]) {
  const [obligations, payments, planList] = await Promise.all([
    tx.duesObligation.findMany({ where: { memberId }, orderBy: { period: 'asc' } }),
    tx.contribution.findMany({
      where: { memberId, category: 'dues', reversedAt: null, amountCents: { gt: 0 } },
      orderBy: [{ entryTimestamp: 'asc' }, { id: 'asc' }],
      select: { transactionId: true, amountCents: true },
    }),
    plans ? Promise.resolve(null) : tx.duesPlan.findMany({ where: { memberId }, orderBy: { startPeriod: 'asc' } }),
  ])
  const rows = plans ?? planRows(planList!)
  const status = duesStatus({
    obligations: obligations.map((o) => ({ period: o.period, amount: fromBigInt(o.amountCents) })),
    payments: payments.map((p) => ({ id: p.transactionId, amount: fromBigInt(p.amountCents) })),
    currentPeriod: current,
  })
  return { status, plans: rows, coveredThrough: coveredThrough(status, rows) }
}

/**
 * Keep a member's obligations right when their status changes: no dues
 * accrue while inactive, and reactivating does not bill the months away.
 */
export async function onMemberStatusChange(tx: Tx, memberId: string, before: string, after: string, asOf: IsoDate = todayIso()) {
  if (before === after) return
  const member = await tx.member.findUniqueOrThrow({ where: { id: memberId }, select: { id: true, joinDate: true, duesThrough: true } })
  const current = periodOf(asOf)
  if (after === 'Active') {
    // Bill again from this month; never the months away.
    await tx.member.update({ where: { id: memberId }, data: { duesThrough: addPeriods(current, -1) } })
  } else if (before === 'Active') {
    // They were active until now: bill any months not billed yet, then stop.
    const plans = await plansFor(tx, member)
    const from = member.duesThrough ? addPeriods(member.duesThrough, 1) : plans[0].startPeriod
    await bill(tx, memberId, from, current, planRows(plans))
    await tx.member.update({ where: { id: memberId }, data: { duesThrough: laterPeriod(member.duesThrough ?? current, current) } })
  }
  await syncMemberDues(tx, memberId, asOf)
}

// ── Recording ──────────────────────────────────────────────────────────

export type ContributionCategory = 'dues' | 'voluntary'

export type RecordContributionParams = {
  memberId: string
  amount: number // dollars; must be whole cents
  paymentDate: Date
  paymentMethod?: string | null
  receivedBy?: string | null
  comments?: string | null
  source: string
  category?: ContributionCategory
}

function monthYearFromDate(date: Date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]}-${date.getFullYear()}`
}

/** Auto-pay is collected on the 15th, whatever day it was entered. */
function normalizeAutoPayDate(paymentDate: Date, paymentMethod?: string | null) {
  if (paymentMethod !== 'Auto-pay') return paymentDate
  const normalized = new Date(paymentDate)
  normalized.setDate(15)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

async function nextReceiptNumber(tx: Tx): Promise<string> {
  const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('receipt_number_seq')`
  return `RC-${todayIso().slice(0, 4)}-${String(nextval).padStart(6, '0')}`
}

/**
 * What a receipt says the payment covered, fixed when it is issued:
 * "Dues Jan – Mar 2026", "(Mar 2026 in part)", and any credit held.
 */
export function describeCoverage(
  category: ContributionCategory, allocation: { period: Period; amount: Cents }[], amount: Cents, stillOwed: ReadonlySet<Period>,
): string {
  if (category === 'voluntary') return 'Voluntary contribution (not applied to dues)'
  const parts: string[] = []
  if (allocation.length > 0) {
    const last = allocation[allocation.length - 1].period
    parts.push(`Dues ${periodRangeLabel(allocation.map((a) => a.period))}${stillOwed.has(last) ? ` (${periodLabel(last)} in part)` : ''}`)
  }
  const credit = subtract(amount, sum(allocation.map((a) => a.amount)))
  if (credit > 0) parts.push(`${formatUSD(credit)} held as credit toward the next months`)
  return parts.join('; ')
}

/**
 * Record a payment and issue its receipt. The member's obligations and
 * summary fields are brought up to date in the same transaction, and the
 * payment posts to the ledger once the chart is approved.
 */
export async function recordContribution(tx: Tx, params: RecordContributionParams) {
  let amountCents: Cents
  try {
    amountCents = fromLegacyDollars(params.amount)
  } catch {
    throw new OperationError(400, 'Amount must be in whole cents.')
  }
  if (amountCents <= 0) throw new OperationError(400, 'Amount must be greater than 0.')
  const member = await tx.member.findUnique({ where: { id: params.memberId }, select: { legalName: true } })
  if (!member) throw new OperationError(404, 'Member not found')
  const category = params.category ?? 'dues'
  const paymentDate = normalizeAutoPayDate(params.paymentDate, params.paymentMethod)

  const created = await tx.contribution.create({
    data: {
      transactionId: nextPublicId('CON'),
      memberId: params.memberId,
      memberName: member.legalName,
      paymentDate,
      monthYear: monthYearFromDate(paymentDate),
      amount: toLegacyDollars(amountCents),
      amountCents: toBigInt(amountCents),
      category,
      receiptNumber: await nextReceiptNumber(tx),
      paymentMethod: params.paymentMethod || null,
      receivedBy: params.receivedBy || null,
      comments: params.comments || null,
      source: params.source,
    },
  })
  const { status } = await syncMemberDues(tx, params.memberId)
  const stillOwed = new Set(status.obligations.filter((o) => o.remaining > 0).map((o) => o.period))
  const receiptCovers = describeCoverage(category, status.allocations.get(created.transactionId) ?? [], amountCents, stillOwed)
  const saved = await tx.contribution.update({ where: { id: created.id }, data: { receiptCovers } })
  const journalEntries = await postPendingContributionEntries(tx, params.memberId)
  return { ...saved, journalEntries }
}

// ── Reversal ───────────────────────────────────────────────────────────

export type ReverseInput = { transactionId: string; reason: string }

export async function checkReversal(tx: Pick<Tx, 'contribution'>, input: ReverseInput) {
  const contribution = await tx.contribution.findUnique({ where: { transactionId: input.transactionId } })
  if (!contribution) throw new OperationError(404, 'Contribution not found.')
  if (contribution.reversedAt) throw new OperationError(409, 'This contribution has already been reversed.')
  if (!input.reason.trim()) throw new OperationError(400, 'Give a reason for the reversal.')
  return contribution
}

/**
 * Correct a mistaken contribution: it stays on record, marked reversed,
 * and stops counting towards dues and totals; its ledger entry is
 * reversed. A refund of card money, if any is due, is handled in Stripe.
 */
export async function reverseContribution(tx: Tx, input: ReverseInput, actors: Actors, ctx: AuditContext) {
  const contribution = await checkReversal(tx, input)
  // Only one reversal request per contribution can be pending, and the
  // database refuses a second reversal of the same row.
  await tx.contribution.update({
    where: { id: contribution.id },
    data: { reversedAt: new Date(), reversedBy: actors.maker.id, reversalReason: input.reason.trim() },
  })
  const { coveredThrough: through, thisMonth } = await syncMemberDues(tx, contribution.memberId)
  const journalEntries = await postPendingContributionEntries(tx, contribution.memberId)
  await recordAudit(tx, ctx, {
    action: 'contribution.reverse', entityType: 'contribution', entityId: contribution.transactionId,
    before: contribution,
    metadata: { reason: input.reason.trim(), memberAfter: { coveredThrough: through, thisMonth }, journalEntries, maker: actors.maker.id, checker: actors.checker!.id },
  })
  return { transactionId: contribution.transactionId, journalEntries }
}

// ── Ledger ─────────────────────────────────────────────────────────────

/**
 * Post contributions not yet in the ledger, and the reversals of reversed
 * ones: receipted rows once the chart is approved, and rows recorded
 * before receipts existed once opening balances are posted (M4).
 */
export async function postPendingContributionEntries(tx: Tx, memberId: string): Promise<string[]> {
  // Rows recorded before receipts existed post once opening balances exist
  // (M4), from the cutover on; earlier ones are inside the opening balances.
  const opened = await ledgerOpening(tx)
  const pending = await tx.contribution.findMany({
    where: {
      memberId,
      amountCents: { gt: 0 },
      AND: [
        { OR: [{ receiptNumber: { not: null } }, ...(opened ? [{ paymentDate: { gte: dateOnly(opened.cutover) } }] : [])] },
        { OR: [{ journalEntry: null }, { reversedAt: { not: null }, reversalEntry: null }] },
      ],
    },
    orderBy: [{ entryTimestamp: 'asc' }, { id: 'asc' }],
  })
  const posted: string[] = []
  for (const c of pending) {
    let journalEntry = c.journalEntry
    if (!journalEntry) {
      journalEntry = await postWhenChartApproved(tx, {
        effectiveDate: isoDateOf(c.paymentDate),
        type: 'contribution',
        description: `${c.category === 'voluntary' ? 'Voluntary contribution' : 'Dues'} from ${c.memberName} (${c.receiptNumber ?? c.transactionId})`,
        reference: c.receiptNumber,
        source: { type: 'contribution', id: c.transactionId },
        idempotencyKey: `contribution:${c.transactionId}`,
        lines: [
          { account: receiptAccount(c.paymentMethod), debit: fromBigInt(c.amountCents) },
          { account: MEMBER_CAPITAL_ACCOUNT, credit: fromBigInt(c.amountCents), memberId: c.memberId },
        ],
      })
      if (!journalEntry) continue
      posted.push(journalEntry)
      await tx.contribution.update({ where: { id: c.id }, data: { journalEntry } })
    }
    if (c.reversedAt && !c.reversalEntry) {
      const original = await tx.journalEntry.findUniqueOrThrow({ where: { entryNumber: journalEntry }, select: { id: true } })
      const reversal = await reverseEntry(tx, original.id, {
        effectiveDate: clubDateOf(c.reversedAt), reason: c.reversalReason!, createdBy: c.reversedBy,
      })
      posted.push(reversal.entryNumber)
      await tx.contribution.update({ where: { id: c.id }, data: { reversalEntry: reversal.entryNumber } })
    }
  }
  return posted
}


// ── Plans ──────────────────────────────────────────────────────────────

export type PlanChangeInput = { memberId: string; amountCents: Cents; startPeriod: Period; note: string | null }

/**
 * Change a member's monthly dues from a month that has not been billed
 * yet (no retroactive changes; $0 exempts the member from that month on).
 */
export async function changeDuesPlan(tx: Tx, input: PlanChangeInput, actorId: string, ctx: AuditContext) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) throw new OperationError(400, 'The amount must be $0 or more.')
  const synced = await syncMemberDues(tx, input.memberId)
  const member = await tx.member.findUniqueOrThrow({ where: { id: input.memberId }, select: { duesThrough: true } })
  const firstOpen = addPeriods(member.duesThrough!, 1)
  if (input.startPeriod < firstOpen) {
    throw new OperationError(409, `Dues up to ${periodLabel(member.duesThrough!)} have already been billed; a change can start from ${periodLabel(firstOpen)}.`)
  }
  const existing = await tx.duesPlan.findUnique({ where: { memberId_startPeriod: { memberId: input.memberId, startPeriod: input.startPeriod } } })
  if (existing) throw new OperationError(409, `A change starting ${periodLabel(input.startPeriod)} is already recorded.`)
  const plan = await tx.duesPlan.create({
    data: { memberId: input.memberId, amountCents: toBigInt(input.amountCents), startPeriod: input.startPeriod, note: input.note, createdBy: actorId },
  })
  await recordAudit(tx, ctx, {
    action: 'dues.plan.change', entityType: 'member', entityId: input.memberId,
    before: { plans: synced.plans }, after: plan,
  })
  return plan
}

// ── Daily job ──────────────────────────────────────────────────────────

export type DuesReport = {
  asOf: IsoDate
  membersChecked: number
  obligationsCreated: number
  /** Members whose "this month" changed (e.g. a new month started). */
  changed: { memberId: string; from: string; to: string }[]
  inArrears: { memberId: string; name: string; months: number; amount: string }[]
  journalEntries: string[]
  errors: { memberId: string; error: string }[]
}

/**
 * Create this month's obligations, refresh every member's dues status and
 * post anything waiting for the ledger. Safe to run more than once a day.
 */
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function serviceDues(asOf: IsoDate = todayIso()): Promise<DuesReport> {
  const report: DuesReport = { asOf, membersChecked: 0, obligationsCreated: 0, changed: [], inArrears: [], journalEntries: [], errors: [] }
  const members = await prisma.member.findMany({ select: { id: true, legalName: true }, orderBy: { id: 'asc' } })
  for (const m of members) {
    try {
      await prisma.$transaction(async (tx) => {
        const synced = await syncMemberDues(tx, m.id, asOf)
        const posted = await postPendingContributionEntries(tx, m.id)
        report.membersChecked++
        report.obligationsCreated += synced.created
        report.journalEntries.push(...posted)
        if (synced.thisMonthBefore !== synced.thisMonth) report.changed.push({ memberId: m.id, from: synced.thisMonthBefore, to: synced.thisMonth })
        if (synced.status.overduePeriods.length > 0) {
          report.inArrears.push({ memberId: m.id, name: m.legalName, months: synced.status.overduePeriods.length, amount: formatUSD(synced.status.arrears) })
        }
      })
    } catch (err) {
      report.errors.push({ memberId: m.id, error: message(err) })
    }
  }
  // After opening balances (M4): withdrawals and loans made before the
  // loan engine post here until they post on their own (M5).
  try {
    report.journalEntries.push(...await prisma.$transaction((tx) => postLegacyActivity(tx), { timeout: 120_000 }))
  } catch (err) {
    report.errors.push({ memberId: 'ledger', error: message(err) })
  }
  return report
}
