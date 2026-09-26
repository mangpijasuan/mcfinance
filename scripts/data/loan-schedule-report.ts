// Read-only: how loans made before the loan engine would look on it.
// For each such loan still being repaid, rebuilds the schedule (policy:
// installments on the 10th from the month after the loan date), replays
// the recorded repayments, and compares the result with the hand-kept
// balance and overdue flag. Changes nothing.
//
//   npm run loans:schedule-report [-- --as-of=2026-10-01]
//
// Run it against the production snapshot (Gate #1 A14) before migrating
// these loans (step M4); every mismatch needs an explanation first.
import { isIsoDate, isoDateOf, todayIso } from '@/lib/dates'
import { formatUSD, fromLegacyDollars } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { buildSchedule, delinquency, outstandingPrincipal, replay } from '@/modules/loans/amortization'

async function main() {
  const asOfArg = process.argv.slice(2).find((a) => a.startsWith('--as-of='))?.slice('--as-of='.length)
  if (asOfArg !== undefined && !isIsoDate(asOfArg)) throw new Error(`--as-of must be a date like 2026-10-01, got "${asOfArg}"`)
  const asOf = asOfArg ?? todayIso()
  const loans = await prisma.loan.findMany({
    where: { principalCents: null, lifecycle: 'disbursed', status: 'Active' },
    include: { payments: { orderBy: { createdAt: 'asc' } } },
    orderBy: { loanId: 'asc' },
  })
  let mismatches = 0
  console.log(`Loans without a stored schedule, as of ${asOf}: ${loans.length}`)
  for (const loan of loans) {
    const problems: string[] = []
    try {
      const schedule = buildSchedule({ principal: fromLegacyDollars(loan.loanAmount), installments: loan.termMonths, loanDate: isoDateOf(loan.loanDate) })
      const { position, unapplied } = replay(schedule, loan.payments.map((p) => ({
        type: 'payment' as const, amount: fromLegacyDollars(p.amount), asOf: isoDateOf(p.paymentDate),
      })))
      const derived = outstandingPrincipal(position)
      const recorded = fromLegacyDollars(loan.balanceRemaining)
      if (derived !== recorded) problems.push(`balance ${formatUSD(recorded)} recorded, ${formatUSD(derived)} from the schedule`)
      if (unapplied > 0) problems.push(`${formatUSD(unapplied)} paid beyond the principal`)
      const d = delinquency(position, asOf, loan.graceDays ?? 15)
      if ((d.status === 'delinquent') !== loan.overdue) {
        problems.push(`overdue flag is ${loan.overdue}, schedule says ${d.status} (${d.daysPastDue} days past due)`)
      }
      const future = loan.payments.filter((p) => isoDateOf(p.paymentDate) > asOf)
      if (future.length > 0) problems.push(`${future.length} repayment(s) dated in the future (F-10)`)
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err))
    }
    if (problems.length > 0) mismatches++
    console.log(`${problems.length ? '✗' : '✓'} ${loan.loanId} ${loan.borrowerName}: ${problems.length ? problems.join('; ') : 'matches'}`)
  }
  console.log(`${mismatches} of ${loans.length} need an explanation before migration.`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
