// Nightly comparison of the ledger with the old records (migration step
// M5). See src/modules/accounting/comparison. Run it once a day from cron,
// after dues:service and loans:service:
//
//   npm run ledger:compare
//   npm run ledger:compare -- --as-of=2026-10-31
//
// Stores the result, emails LEDGER_ALERT_EMAIL (or SECURITY_ALERT_EMAIL)
// when anything differs, and exits non-zero in that case.
import { formatUSD } from '@/lib/money'
import { isIsoDate } from '@/lib/dates'
import { prisma } from '@/lib/prisma'
import { comparisonStatus, runLedgerComparison } from '@/modules/accounting/comparison'

async function main() {
  const asOfArg = process.argv.slice(2).find((a) => a.startsWith('--as-of='))?.slice('--as-of='.length)
  if (asOfArg !== undefined && !isIsoDate(asOfArg)) throw new Error(`--as-of must be a date like 2026-10-01, got "${asOfArg}"`)
  const run = await runLedgerComparison(prisma, asOfArg)
  if (!run) {
    console.log('Opening balances are not posted yet (M4): nothing to compare.')
    return
  }
  const status = await comparisonStatus(prisma, run.runDate)
  console.log(`Ledger comparison for ${run.runDate}: ${run.ok ? 'no differences' : `${run.differences} difference(s)`}`)
  for (const p of run.details.invariants) console.log(`  invariant: ${p}`)
  for (const m of run.details.memberCapital) console.log(`  member ${m.memberId} ${m.name}: ledger ${formatUSD(m.ledgerCents)}, records ${formatUSD(m.legacyCents)}`)
  for (const l of run.details.loans) console.log(`  loan ${l.loanId} ${l.borrower}: ledger ${formatUSD(l.ledgerCents)}, records ${formatUSD(l.legacyCents)}`)
  for (const u of run.details.unposted) console.log(`  not in the ledger: ${u.kind} ${u.id} ${u.date} ${formatUSD(u.cents)}`)
  if (status.started) {
    const s = status.streak
    console.log(`  clean days in a row: ${s.days}/${status.target}${s.includesMonthEnd ? ', including a month-end' : ''}${s.met ? ' — M5 exit criterion met' : ''}`)
  }
  if (run.emailedTo) console.log(`  alert emailed to ${run.emailedTo}`)
  if (!run.ok) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
