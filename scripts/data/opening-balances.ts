// Opening balances (migration step M4): report, and a full rehearsal.
// Read-only unless --rehearse, which posts everything inside a
// transaction, checks the result, and rolls it all back.
//
//   npm run ledger:opening -- --bank-balance=12345.67
//   npm run ledger:opening -- --bank-balance=12345.67 --loans=confirmed.json --rehearse
//   options: --cutover=2026-01-01 (default)  --json (machine-readable output)
//
// confirmed.json: { "LD02": "3541.69", … } — Treasurer-confirmed balances at
// the cutover, where they differ from loan amount less repayments.
// Run it against the production snapshot (Gate #1 A14) before proposing
// the real posting on the Ledger → Opening balances page.
// Rehearse on a copy of the database, not the live one: a rolled-back
// rehearsal still uses up journal entry numbers (sequences never roll back).
import { readFileSync } from 'node:fs'
import { type Cents, formatUSD, parseDollars } from '@/lib/money'
import { isIsoDate } from '@/lib/dates'
import { prisma } from '@/lib/prisma'
import { systemAuditContext } from '@/modules/audit'
import { approveAccounts, checkInvariants, trialBalance } from '@/modules/accounting/ledger'
import { DEFAULT_CUTOVER, type OpeningInputs, type OpeningReport, checkOpening, planOpening, postOpeningBalances, reconcile } from '@/modules/accounting/opening'

class Rollback extends Error {
  constructor(public result: unknown) { super('rollback') }
}

function arg(name: string) {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function printReport(r: OpeningReport) {
  console.log(`Opening balances at ${r.openingDate} (cutover ${r.cutover})`)
  console.log(`  member capital   ${formatUSD(r.memberCapital.totalCents)} (${r.memberCapital.members} members)`)
  console.log(`  bank             ${r.bankCents === null ? 'not entered' : formatUSD(r.bankCents)}`)
  console.log(`  loans receivable ${formatUSD(r.loansTotalCents)} (${r.loansAtCutover.length} loans)`)
  console.log(`  opening equity   ${formatUSD(r.openingEquityCents)}  ← must be explained to the board`)
  for (const [k, v] of Object.entries(r.replay)) console.log(`  since cutover: ${k} ${v.count} (${formatUSD(v.totalCents)})`)
  for (const a of r.anomalies) console.log(`  REVIEW ${a.code}: ${a.message} — ${a.count}${a.totalCents !== undefined ? `, ${formatUSD(a.totalCents)}` : ''}`)
  for (const c of r.checks.memberCapital) console.log(`  DIFF capital ${c.memberId} ${c.name}: ledger ${formatUSD(c.ledgerCents)} vs record ${formatUSD(c.legacyCents)}`)
  for (const c of r.checks.loans) console.log(`  DIFF loan ${c.loanId}: ledger ${formatUSD(c.ledgerCents)} vs record ${formatUSD(c.legacyCents)}`)
  console.log(`  older loans onto the engine: ${r.adoption.adopt.join(', ') || 'none'}`)
  for (const k of r.adoption.keepLegacy) console.log(`    ${k.loanId} stays: ${k.reason}`)
}

async function main() {
  const cutover = arg('cutover') ?? DEFAULT_CUTOVER
  if (!isIsoDate(cutover)) throw new Error('--cutover must be YYYY-MM-DD')
  const bankArg = arg('bank-balance')
  const confirmed: Record<string, Cents> = {}
  const loansFile = arg('loans')
  if (loansFile) {
    for (const [loanId, value] of Object.entries(JSON.parse(readFileSync(loansFile, 'utf8')) as Record<string, string>)) confirmed[loanId] = parseDollars(value)
  }
  const inputs: OpeningInputs = { cutover, bankBalanceCents: bankArg === undefined ? null : parseDollars(bankArg), confirmedLoanBalances: confirmed }
  const json = process.argv.includes('--json')

  if (!process.argv.includes('--rehearse')) {
    const { report } = await planOpening(prisma, inputs)
    if (json) console.log(JSON.stringify(report, null, 2))
    else printReport(report)
    return
  }

  try {
    await prisma.$transaction(async (tx) => {
      // A rehearsal may run before the accountant approves the chart; the approval is rolled back too.
      const proposed = await tx.ledgerAccount.findMany({ where: { status: 'proposed' }, select: { code: true } })
      await approveAccounts(tx, { codes: proposed.map((a) => a.code), approvedBy: 'rehearsal', note: 'M4 rehearsal (rolled back)' })
      const plan = await checkOpening(tx, inputs)
      const posted = await postOpeningBalances(tx, { ...inputs, bankBalanceCents: inputs.bankBalanceCents!, openingHash: plan.openingHash },
        { maker: { id: 'rehearsal-maker', email: '' }, checker: { id: 'rehearsal-checker', email: '' } }, systemAuditContext('m4-rehearsal'))
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE') // run the deferred balance checks now
      throw new Rollback({ report: plan.report, posted, trialBalance: await trialBalance(tx), invariants: await checkInvariants(tx), reconcile: await reconcile(tx) })
    }, { timeout: 600_000, maxWait: 30_000 })
  } catch (err) {
    if (!(err instanceof Rollback)) throw err
    const result = err.result as {
      report: OpeningReport; posted: { entries: string[]; adoptedLoans: string[] }
      trialBalance: { balanced: boolean; totalDebit: Cents; rows: { code: string; name: string; balance: Cents }[] }
      invariants: { ok: boolean; problems: string[] }; reconcile: Awaited<ReturnType<typeof reconcile>>
    }
    if (json) { console.log(JSON.stringify(result, null, 2)); return }
    printReport(result.report)
    console.log(`\nRehearsal (rolled back): ${result.posted.entries.length} entries, ${result.posted.adoptedLoans.length} loans onto the engine`)
    console.log(`  trial balance ${result.trialBalance.balanced ? 'balances' : 'DOES NOT BALANCE'} at ${formatUSD(result.trialBalance.totalDebit)}`)
    for (const row of result.trialBalance.rows.filter((r) => r.balance !== 0)) console.log(`    ${row.code} ${row.name.padEnd(34)} ${formatUSD(row.balance)}`)
    console.log(`  ledger invariants: ${result.invariants.ok ? 'OK' : result.invariants.problems.join('; ')}`)
    const diffs = (result.reconcile?.memberCapital.length ?? 0) + (result.reconcile?.loans.length ?? 0)
    console.log(`  ledger vs records after posting: ${diffs} difference(s)`)
    if (!result.trialBalance.balanced || !result.invariants.ok) process.exitCode = 1
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
