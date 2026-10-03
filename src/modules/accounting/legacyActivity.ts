// Ledger postings for money recorded outside the flows that post on their
// own: withdrawals, and loans made before the loan engine (disbursement and
// repayments). They start once opening balances exist (M4, ./opening) and
// run from the daily dues job until those flows post themselves (M5).
import type { Prisma } from '@prisma/client'
import { type Cents, ZERO, cents, fromBigInt, min, subtract } from '@/lib/money'
import { type IsoDate, dateOnly, isoDateOf } from '@/lib/dates'
import { type EntryInput, type LineInput, postEntry } from './ledger'
import { CASH_ACCOUNTS, OPENING_KEYS, ledgerOpening, receiptAccount } from './autoPost'

type Tx = Prisma.TransactionClient

export const MEMBER_CAPITAL = '2000'
export const LOANS_RECEIVABLE = '1100'
export const UNAPPLIED = '2100'

type LegacyLoan = Prisma.LoanGetPayload<{ include: { payments: true } }>

/** A legacy Float amount in cents, and whether it was a whole number of cents. */
export function legacyCents(value: number): { amount: Cents; exact: boolean } {
  const scaled = value * 100
  const rounded = Math.round(scaled)
  return { amount: cents(rounded === 0 ? 0 : rounded), exact: Math.abs(scaled - rounded) < 1e-6 }
}

/**
 * The running principal of a legacy loan through its repayments from the
 * cutover on: principal paid first, anything beyond the balance unapplied.
 */
export function legacyRepayments(loan: LegacyLoan, cutover: IsoDate, balanceAtCutover: Cents) {
  const startsAfter = isoDateOf(loan.loanDate) >= cutover
  let balance = startsAfter ? legacyCents(loan.loanAmount).amount : balanceAtCutover
  const splits: { payment: LegacyLoan['payments'][number]; date: IsoDate; amount: Cents; principal: Cents; unapplied: Cents }[] = []
  for (const payment of loan.payments) {
    const date = isoDateOf(payment.paymentDate)
    if (date < cutover) continue
    const amount = legacyCents(payment.amount).amount
    if (amount <= 0) continue
    const principal = min(amount, balance)
    balance = subtract(balance, principal)
    splits.push({ payment, date, amount, principal, unapplied: subtract(amount, principal) })
  }
  return { splits, balance, startsAfter }
}

type Poster = (input: EntryInput) => Promise<string>

function poster(tx: Tx, posted: string[]): Poster {
  return async (input) => {
    const { entry, replayed } = await postEntry(tx, input)
    if (!replayed) posted.push(entry.entryNumber)
    return entry.entryNumber
  }
}

type WithdrawalRow = { withdrawalId: string; memberId: string; memberName: string; amount: number; withdrawalDate: Date; type: string }

function withdrawalEntry(w: WithdrawalRow): EntryInput {
  const amount = legacyCents(w.amount).amount
  return {
    effectiveDate: isoDateOf(w.withdrawalDate), type: 'withdrawal',
    description: `${w.type === 'Full Exit' ? 'Full exit' : 'Withdrawal'} ${w.withdrawalId} paid to ${w.memberName}`,
    source: { type: 'withdrawal', id: w.withdrawalId }, idempotencyKey: `withdrawal:${w.withdrawalId}`,
    lines: [{ account: MEMBER_CAPITAL, debit: amount, memberId: w.memberId }, { account: CASH_ACCOUNTS.bank, credit: amount }],
  }
}

async function balancesAtCutover(tx: Tx, loanId?: string): Promise<Map<string, Cents>> {
  const lines = await tx.journalLine.findMany({
    where: { entry: { idempotencyKey: OPENING_KEYS.loans }, accountCode: LOANS_RECEIVABLE, ...(loanId ? { loanId } : {}) },
    select: { loanId: true, debitCents: true },
  })
  return new Map(lines.map((l) => [l.loanId!, fromBigInt(l.debitCents)]))
}

/** The payout (if made after the cutover) and each repayment since the cutover of a loan made before the loan engine. */
async function postLegacyLoan(tx: Tx, loan: LegacyLoan, cutover: IsoDate, atCutover: Cents, post: Poster) {
  const { splits, startsAfter } = legacyRepayments(loan, cutover, atCutover)
  if (startsAfter) {
    const amount = legacyCents(loan.loanAmount).amount
    await post({
      effectiveDate: isoDateOf(loan.loanDate), type: 'loan_disbursement',
      description: `Loan ${loan.loanId} paid out to ${loan.borrowerName} (recorded before the loan engine)`,
      source: { type: 'loan', id: loan.loanId }, idempotencyKey: `m4:loan-disbursement:${loan.loanId}`,
      lines: [{ account: LOANS_RECEIVABLE, debit: amount, memberId: loan.borrowerId, loanId: loan.loanId }, { account: CASH_ACCOUNTS.bank, credit: amount }],
    })
  }
  for (const s of splits) {
    if (s.payment.journalEntry) continue
    const lines: LineInput[] = [{ account: receiptAccount(s.payment.paymentMethod), debit: s.amount }]
    if (s.principal > 0) lines.push({ account: LOANS_RECEIVABLE, credit: s.principal, memberId: loan.borrowerId, loanId: loan.loanId })
    if (s.unapplied > 0) lines.push({ account: UNAPPLIED, credit: s.unapplied, memberId: loan.borrowerId, memo: 'Paid beyond the loan balance' })
    const entryNumber = await post({
      effectiveDate: s.date, type: 'loan_repayment',
      description: `Repayment ${s.payment.paymentId} on loan ${loan.loanId} (recorded before the loan engine)`,
      reference: s.payment.comments, source: { type: 'loan_payment', id: s.payment.paymentId },
      idempotencyKey: `m4:loan-payment:${s.payment.paymentId}`, lines,
    })
    await tx.loanPayment.update({ where: { id: s.payment.id }, data: { journalEntry: entryNumber } })
  }
}

const LEGACY_LOANS = { principalCents: null, lifecycle: { not: 'cancelled' } } as const
const LEGACY_PAYMENT_ORDER = { orderBy: [{ paymentDate: 'asc' as const }, { eventSeq: 'asc' as const }] }

/**
 * Post everything recorded since the cutover that has no ledger entry yet:
 * withdrawals, and loans made before the loan engine (disbursement and
 * repayments). Contributions post through their own flow. Does nothing
 * until opening balances exist. Safe to repeat: the daily job runs it to
 * catch anything recorded outside the app.
 */
export async function postLegacyActivity(tx: Tx): Promise<string[]> {
  const opened = await ledgerOpening(tx)
  if (!opened) return []
  const { cutover } = opened
  const posted: string[] = []
  const post = poster(tx, posted)

  const withdrawals = await tx.withdrawal.findMany({
    where: { withdrawalDate: { gte: dateOnly(cutover) }, amount: { gt: 0 } },
    orderBy: [{ withdrawalDate: 'asc' }, { withdrawalId: 'asc' }],
  })
  for (const w of withdrawals) await post(withdrawalEntry(w))

  const atCutover = await balancesAtCutover(tx)
  const loans = await tx.loan.findMany({ where: LEGACY_LOANS, include: { payments: LEGACY_PAYMENT_ORDER } })
  for (const loan of loans) await postLegacyLoan(tx, loan, cutover, atCutover.get(loan.loanId) ?? ZERO, post)
  return posted
}

/**
 * Dual-write (M5): post a withdrawal in the transaction that records it,
 * once opening balances exist. Earlier ones are posted with the opening
 * balances. Returns the entry number, or null when it does not post yet.
 */
export async function postWithdrawalNow(tx: Tx, withdrawalId: string): Promise<string | null> {
  const opened = await ledgerOpening(tx)
  if (!opened) return null
  const w = await tx.withdrawal.findUniqueOrThrow({ where: { withdrawalId } })
  if (w.amount <= 0 || w.withdrawalDate < dateOnly(opened.cutover)) return null
  return poster(tx, [])(withdrawalEntry(w))
}

/**
 * Dual-write (M5): post a repayment on a loan made before the loan engine
 * in the transaction that records it, once opening balances exist.
 */
export async function postLegacyLoanNow(tx: Tx, loanId: string): Promise<string[]> {
  const opened = await ledgerOpening(tx)
  if (!opened) return []
  const loan = await tx.loan.findFirst({ where: { loanId, ...LEGACY_LOANS }, include: { payments: LEGACY_PAYMENT_ORDER } })
  if (!loan) return []
  const posted: string[] = []
  await postLegacyLoan(tx, loan, opened.cutover, (await balancesAtCutover(tx, loanId)).get(loanId) ?? ZERO, poster(tx, posted))
  return posted
}
