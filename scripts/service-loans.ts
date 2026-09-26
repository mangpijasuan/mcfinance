// Daily loan servicing: late fees (switched off until counsel confirms,
// Gate #1 A7), delinquency, and posting anything waiting for the ledger.
// See src/modules/loans/servicing.ts. Run it once a day from cron:
//
//   npm run loans:service                      # as of today (CLUB_TIME_ZONE)
//   npm run loans:service -- --as-of=2026-10-01
//   npm run loans:service -- --dry-run         # report only, change nothing
//
// Exits non-zero if any loan could not be serviced.
import { isIsoDate } from '@/lib/dates'
import { prisma } from '@/lib/prisma'
import { serviceLoans } from '@/modules/loans/servicing'

async function main() {
  const args = process.argv.slice(2)
  const asOfArg = args.find((a) => a.startsWith('--as-of='))?.slice('--as-of='.length)
  if (asOfArg !== undefined && !isIsoDate(asOfArg)) throw new Error(`--as-of must be a date like 2026-10-01, got "${asOfArg}"`)
  const report = await serviceLoans({ asOf: asOfArg, dryRun: args.includes('--dry-run') })

  console.log(`Loan servicing as of ${report.asOf}${report.dryRun ? ' (dry run: nothing saved)' : ''}`)
  console.log(`  loans checked: ${report.loansChecked}`)
  console.log(`  late fees: ${report.lateFeesEnabled ? 'charged' : 'switched off (Gate #1 A7)'}`)
  for (const c of report.changes) console.log(`  ${c.loanId}: ${c.from ?? '—'} → ${c.to ?? '—'}`)
  for (const d of report.delinquent) console.log(`  delinquent ${d.loanId} (${d.borrower}): ${d.daysPastDue} days, ${d.overdue} overdue`)
  for (const f of report.feesCharged) console.log(`  fees charged on ${f.loanId}: ${f.feeIds.join(', ')}`)
  for (const f of report.feesNotCharged) console.log(`  would charge ${f.amount} on ${f.loanId} (installments ${f.installments.join(', ')})`)
  if (report.journalEntries.length) console.log(`  posted to the ledger: ${report.journalEntries.join(', ')}`)
  for (const e of report.errors) console.error(`  ERROR ${e.loanId}: ${e.error}`)
  if (report.errors.length > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
