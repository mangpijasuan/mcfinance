// Daily dues job: creates each active member's obligation for the new
// month, refreshes "paid this month" and arrears, and posts contributions
// waiting for the ledger. See src/modules/contributions. Run it once a day
// from cron (safe to repeat):
//
//   npm run dues:service
//   npm run dues:service -- --as-of=2026-10-01
//
// Exits non-zero if any member could not be processed.
import { isIsoDate } from '@/lib/dates'
import { prisma } from '@/lib/prisma'
import { serviceDues } from '@/modules/contributions'

async function main() {
  const asOfArg = process.argv.slice(2).find((a) => a.startsWith('--as-of='))?.slice('--as-of='.length)
  if (asOfArg !== undefined && !isIsoDate(asOfArg)) throw new Error(`--as-of must be a date like 2026-10-01, got "${asOfArg}"`)
  const report = await serviceDues(asOfArg)
  console.log(`Dues as of ${report.asOf}`)
  console.log(`  members checked: ${report.membersChecked}, new obligations: ${report.obligationsCreated}`)
  for (const c of report.changed) console.log(`  ${c.memberId}: this month ${c.from} → ${c.to}`)
  console.log(`  members in arrears: ${report.inArrears.length}`)
  for (const a of report.inArrears) console.log(`    ${a.memberId} ${a.name}: ${a.months} month(s), ${a.amount}`)
  if (report.journalEntries.length) console.log(`  posted to the ledger: ${report.journalEntries.join(', ')}`)
  for (const e of report.errors) console.error(`  ERROR ${e.memberId}: ${e.error}`)
  if (report.errors.length > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
