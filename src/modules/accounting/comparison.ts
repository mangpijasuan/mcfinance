// The nightly comparison of the ledger with the old records (migration step
// M5, docs/architecture/11 §1). Every money event now posts to the ledger
// in the transaction that records it (dual-write); this job checks that
// the two agree. The ledger can become the system of record (M6) after
// 30 consecutive clean days, including a month-end.
//
// A difference is any of: a broken ledger invariant, a member whose
// capital in the ledger differs from their stored total, a loan whose
// receivable differs from its stored balance, or a money record dated on
// or after the cutover with no ledger entry.
import { Prisma, type PrismaClient } from '@prisma/client'
import { type Cents, fromBigInt } from '@/lib/money'
import { type IsoDate, clubDateOf, dateOnly, isoDateOf, todayIso } from '@/lib/dates'
import { escapeHtml, sendEmail } from '@/lib/email'
import { checkInvariants } from './ledger'
import { ledgerOpening } from './autoPost'
import { legacyCents } from './legacyActivity'
import { reconcile } from './opening'

type Db = Prisma.TransactionClient

/** The M5 exit criterion: this many consecutive clean days, including a month-end. */
export const M5_TARGET_DAYS = 30

export type UnpostedKind =
  | 'contribution' | 'contribution_reversal' | 'withdrawal' | 'loan_payment'
  | 'loan_payout' | 'loan_write_off' | 'loan_fee' | 'loan_fee_waiver'

export type Unposted = { kind: UnpostedKind; id: string; date: IsoDate; cents: Cents }

type Reconciled = NonNullable<Awaited<ReturnType<typeof reconcile>>>

export type ComparisonDetails = {
  cutover: IsoDate
  invariants: string[]
  memberCapital: Reconciled['memberCapital']
  loans: Reconciled['loans']
  unposted: Unposted[]
}

export type ComparisonResult = { runDate: IsoDate; ok: boolean; differences: number; details: ComparisonDetails }

// ── Clean days in a row (pure) ──────────────────────────────────────────

const DAY_MS = 86_400_000

function dayBefore(date: IsoDate): IsoDate {
  return isoDateOf(new Date(dateOnly(date).getTime() - DAY_MS))
}

export function isMonthEnd(date: IsoDate): boolean {
  return isoDateOf(new Date(dateOnly(date).getTime() + DAY_MS)).endsWith('-01')
}

export type Streak = { days: number; from: IsoDate | null; to: IsoDate | null; includesMonthEnd: boolean; met: boolean }

export type RunRecord = { runDate: IsoDate; ok: boolean; ranOn: IsoDate }

/**
 * Consecutive clean days ending today (or yesterday, before today's run).
 * A day counts only if it was compared on that day (a run backdated with
 * --as-of reads today's balances, so it proves nothing about that day)
 * and every run for it found no differences; a day without such a run
 * breaks the streak.
 */
export function cleanStreak(runs: readonly RunRecord[], asOf: IsoDate): Streak {
  const failed = new Set(runs.filter((r) => !r.ok).map((r) => r.runDate))
  const clean = new Map<IsoDate, boolean>()
  for (const r of runs) if (r.ranOn === r.runDate) clean.set(r.runDate, !failed.has(r.runDate))
  let day = clean.has(asOf) ? asOf : dayBefore(asOf)
  const to = clean.get(day) ? day : null
  let days = 0
  let from: IsoDate | null = null
  let includesMonthEnd = false
  while (clean.get(day) === true) {
    days += 1
    from = day
    if (isMonthEnd(day)) includesMonthEnd = true
    day = dayBefore(day)
  }
  return { days, from, to, includesMonthEnd, met: days >= M5_TARGET_DAYS && includesMonthEnd }
}

// ── Comparing (database) ────────────────────────────────────────────────

/** Money records dated from the cutover to `asOf` (club calendar days) with no ledger entry. */
async function unpostedRecords(db: Db, cutover: IsoDate, asOf: IsoDate): Promise<Unposted[]> {
  const inRange = (value: Date) => {
    const day = isoDateOf(value)
    return day >= cutover && day <= asOf
  }
  const [contributions, reversals, withdrawals, payments, payouts, olderLoans, writeOffs, fees, waivers] = await Promise.all([
    db.contribution.findMany({ where: { amountCents: { gt: 0 }, journalEntry: null }, select: { transactionId: true, paymentDate: true, amountCents: true } }),
    db.contribution.findMany({ where: { amountCents: { gt: 0 }, reversedAt: { not: null }, reversalEntry: null }, select: { transactionId: true, reversedAt: true, amountCents: true } }),
    db.withdrawal.findMany({ where: { amount: { gt: 0 } }, select: { withdrawalId: true, withdrawalDate: true, amount: true } }),
    db.loanPayment.findMany({ where: { amount: { gt: 0 }, journalEntry: null, loan: { lifecycle: { not: 'cancelled' } } }, select: { paymentId: true, paymentDate: true, amount: true } }),
    db.loan.findMany({ where: { disbursedOn: { not: null }, disbursementEntry: null }, select: { loanId: true, disbursedOn: true, disbursedAmountCents: true } }),
    // Loans made before the loan engine are paid out on their loan date (key m4:loan-disbursement:<id>).
    db.loan.findMany({ where: { principalCents: null, lifecycle: { notIn: ['cancelled', 'approved', 'agreement_signed'] } }, select: { loanId: true, loanDate: true, loanAmount: true } }),
    db.loan.findMany({ where: { chargedOffOn: { not: null }, chargeOffEntry: null }, select: { loanId: true, chargedOffOn: true, balanceRemaining: true } }),
    db.loanFee.findMany({ where: { journalEntry: null }, select: { feeId: true, assessedOn: true, amountCents: true } }),
    db.loanFee.findMany({ where: { status: 'waived', waiverEntry: null }, select: { feeId: true, waivedOn: true, amountCents: true } }),
  ])
  const postedKeys = new Set((await db.journalEntry.findMany({
    where: { idempotencyKey: { in: [...withdrawals.map((w) => `withdrawal:${w.withdrawalId}`), ...olderLoans.map((l) => `m4:loan-disbursement:${l.loanId}`)] } },
    select: { idempotencyKey: true },
  })).map((e) => e.idempotencyKey))

  const out: Unposted[] = []
  const add = (kind: UnpostedKind, id: string, date: Date, cents: Cents) => {
    if (inRange(date)) out.push({ kind, id, date: isoDateOf(date), cents })
  }
  for (const c of contributions) add('contribution', c.transactionId, c.paymentDate, fromBigInt(c.amountCents))
  for (const c of reversals) {
    const day = clubDateOf(c.reversedAt!)
    if (day >= cutover && day <= asOf) out.push({ kind: 'contribution_reversal', id: c.transactionId, date: day, cents: fromBigInt(c.amountCents) })
  }
  for (const w of withdrawals) {
    if (!postedKeys.has(`withdrawal:${w.withdrawalId}`)) add('withdrawal', w.withdrawalId, w.withdrawalDate, legacyCents(w.amount).amount)
  }
  for (const p of payments) add('loan_payment', p.paymentId, p.paymentDate, legacyCents(p.amount).amount)
  for (const l of payouts) add('loan_payout', l.loanId, l.disbursedOn!, fromBigInt(l.disbursedAmountCents ?? BigInt(0)))
  for (const l of olderLoans) {
    if (!postedKeys.has(`m4:loan-disbursement:${l.loanId}`)) add('loan_payout', l.loanId, l.loanDate, legacyCents(l.loanAmount).amount)
  }
  for (const l of writeOffs) add('loan_write_off', l.loanId, l.chargedOffOn!, legacyCents(l.balanceRemaining).amount)
  for (const f of fees) add('loan_fee', f.feeId, f.assessedOn, fromBigInt(f.amountCents))
  for (const f of waivers) add('loan_fee_waiver', f.feeId, f.waivedOn!, fromBigInt(f.amountCents))
  return out.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))
}

/** Compare the ledger with the old records. Null until opening balances are posted. */
export async function compareLedger(db: Db, asOf: IsoDate = todayIso()): Promise<ComparisonResult | null> {
  const reconciled = await reconcile(db)
  if (!reconciled) return null
  const [invariants, unposted] = await Promise.all([checkInvariants(db), unpostedRecords(db, reconciled.cutover, asOf)])
  const details: ComparisonDetails = {
    cutover: reconciled.cutover,
    invariants: invariants.problems,
    memberCapital: reconciled.memberCapital,
    loans: reconciled.loans,
    unposted,
  }
  const differences = details.invariants.length + details.memberCapital.length + details.loans.length + details.unposted.length
  return { runDate: asOf, ok: differences === 0, differences, details }
}

function alertHtml(r: ComparisonResult): string {
  const items = [
    ...r.details.invariants,
    ...r.details.memberCapital.map((m) => `Member capital of ${m.name} (${m.memberId}): ledger ${m.ledgerCents / 100}, records ${m.legacyCents / 100}`),
    ...r.details.loans.map((l) => `Loan ${l.loanId} (${l.borrower}): ledger ${l.ledgerCents / 100}, records ${l.legacyCents / 100}`),
    ...r.details.unposted.map((u) => `Not in the ledger: ${u.kind.replace(/_/g, ' ')} ${u.id} of ${u.date} (${u.cents / 100})`),
  ]
  return `<p>The nightly comparison of the ledger with the old records found ${r.differences} difference(s) on ${r.runDate}.
    The count of clean days for migration step M5 starts again.</p>
    <ul>${items.slice(0, 50).map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
    ${items.length > 50 ? `<p>…and ${items.length - 50} more. See Ledger → Nightly comparison.</p>` : '<p>Details: Ledger → Nightly comparison.</p>'}`
}

/**
 * Run the comparison, store it, and email LEDGER_ALERT_EMAIL (or
 * SECURITY_ALERT_EMAIL) when anything differs. Null before opening balances.
 * Every read happens in one Repeatable Read transaction, so a payment
 * recorded while it runs cannot show up on one side only.
 */
export async function runLedgerComparison(db: Pick<PrismaClient, '$transaction' | 'ledgerComparison'>, asOf: IsoDate = todayIso()) {
  const result = await db.$transaction((tx) => compareLedger(tx, asOf), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000,
  })
  if (!result) return null
  let emailedTo: string | null = null
  const to = process.env.LEDGER_ALERT_EMAIL || process.env.SECURITY_ALERT_EMAIL
  if (!result.ok && to) {
    const sent = await sendEmail(to, `Ledger comparison: ${result.differences} difference(s) on ${result.runDate}`, alertHtml(result))
    if (sent.ok) emailedTo = to
  }
  await db.ledgerComparison.create({
    data: {
      runDate: dateOnly(result.runDate), ok: result.ok, differences: result.differences,
      details: result.details as unknown as Prisma.InputJsonValue, emailedTo,
    },
  })
  return { ...result, emailedTo }
}

export type ComparisonRunSummary = { runDate: IsoDate; ranAt: string; ok: boolean; differences: number; backdated: boolean }

/** The M5 status: the latest run with its details, recent runs, and the clean-day streak. */
export async function comparisonStatus(db: Db, asOf: IsoDate = todayIso()) {
  const opened = await ledgerOpening(db)
  if (!opened) return { started: false as const, target: M5_TARGET_DAYS }
  const rows = await db.ledgerComparison.findMany({
    where: { runDate: { gte: dateOnly(opened.cutover), lte: dateOnly(asOf) } },
    orderBy: [{ runDate: 'desc' }, { ranAt: 'desc' }],
  })
  const runs = rows.map((r) => ({ runDate: isoDateOf(r.runDate), ok: r.ok, ranOn: clubDateOf(r.ranAt) }))
  const latest = rows[0]
    ? { runDate: isoDateOf(rows[0].runDate), ranAt: rows[0].ranAt.toISOString(), ok: rows[0].ok, differences: rows[0].differences, details: rows[0].details as unknown as ComparisonDetails, emailedTo: rows[0].emailedTo }
    : null
  const history: ComparisonRunSummary[] = rows.slice(0, 60).map((r) => ({
    runDate: isoDateOf(r.runDate), ranAt: r.ranAt.toISOString(), ok: r.ok, differences: r.differences,
    backdated: clubDateOf(r.ranAt) !== isoDateOf(r.runDate),
  }))
  return { started: true as const, target: M5_TARGET_DAYS, cutover: opened.cutover, streak: cleanStreak(runs, asOf), latest, history }
}
