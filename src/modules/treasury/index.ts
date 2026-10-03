// Treasury (Gate #1 A10, docs/architecture/08 §1): the club's cash position,
// the minimum cash reserve and the lending capacity, read from the
// database. New loans are approved only within the lending capacity.
//
// Where the cash figure comes from:
// - the ledger, once opening balances are posted (M4): the cash accounts,
//   less withdrawals the daily job has not posted yet;
// - before that, the latest bank balance the Treasurer recorded, carried
//   forward with the money recorded since;
// - otherwise it is unknown, and no loan can be approved until a balance
//   is recorded.
import type { Prisma } from '@prisma/client'
import { type Cents, fromBigInt, formatUSD, subtract, sum, toBigInt } from '@/lib/money'
import { type IsoDate, dateOnly, isoDateOf, todayIso } from '@/lib/dates'
import { nextPublicId } from '@/lib/publicIds'
import { OperationError } from '@/lib/operationError'
import { type AuditContext, recordAudit } from '@/modules/audit'
import type { Actors } from '@/modules/approvals/actors'
import { accountBalance } from '@/modules/accounting/ledger'
import { CASH_ACCOUNTS, ledgerOpening } from '@/modules/accounting/autoPost'
import { MEMBER_CAPITAL, legacyCents } from '@/modules/accounting/legacyActivity'
import { DEFAULT_CUTOVER } from '@/modules/accounting/opening'
import { LIQUIDITY_POLICY, type Reserve, checkCapacity, lendingCapacity, reserveFor, rollForward } from './liquidity'

export { LIQUIDITY_POLICY } from './liquidity'

type Db = Prisma.TransactionClient

/** Loans approved but not yet paid out: their payouts are already promised. */
const COMMITTED_STAGES = ['approved', 'agreement_signed']

export type BankBalanceView = {
  balanceId: string
  statementDate: IsoDate
  balanceCents: Cents
  note: string | null
  recordedBy: string
  approvedBy: string | null
  ageDays: number
}

export type CashPosition =
  | { source: 'ledger'; cents: Cents; accounts: { code: string; cents: Cents }[]; unpostedWithdrawalsCents: Cents }
  | {
      source: 'bank_balance'
      cents: Cents
      balance: BankBalanceView
      since: Record<'contributions' | 'loanRepayments' | 'loanPayouts' | 'withdrawals', { count: number; cents: Cents }>
    }
  | { source: 'unknown'; cents: null }

export type TreasuryPosition = {
  asOf: IsoDate
  cash: CashPosition
  memberCapitalCents: Cents
  recentWithdrawals: { from: IsoDate; cents: Cents }
  reserve: Reserve
  committed: { cents: Cents; loans: { loanId: string; borrowerName: string; lifecycle: string; payoutCents: Cents }[] }
  capacityCents: Cents | null
  policy: typeof LIQUIDITY_POLICY
  warnings: string[]
}

const centsOf = (value: number) => legacyCents(value).amount
const DAY_MS = 86_400_000

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / DAY_MS)
}

/** The same calendar day `months` months earlier (a 31st falls back to the month's end). */
function monthsBefore(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 - months, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return isoDateOf(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay))))
}

function dayBefore(date: IsoDate): IsoDate {
  return isoDateOf(new Date(dateOnly(date).getTime() - DAY_MS))
}

/**
 * A query range wide enough for every moment on the club days after
 * `after` up to and including `upTo`, whatever the time zone. Money dates
 * are calendar dates (midnight UTC) or, for a confirmed Zelle or card
 * payment, the moment it was confirmed; `onClubDays` then keeps the rows
 * whose club calendar date is in range.
 */
function around(after: IsoDate, upTo: IsoDate) {
  return { gte: dateOnly(after), lt: new Date(dateOnly(upTo).getTime() + 2 * DAY_MS) }
}

function onClubDays(value: Date, after: IsoDate, upTo: IsoDate): boolean {
  const day = isoDateOf(value)
  return day > after && day <= upTo
}

/** The bank balance that counts: the latest statement date, then the latest recorded. */
export async function latestBankBalance(db: Db, asOf: IsoDate): Promise<BankBalanceView | null> {
  const row = await db.treasuryBankBalance.findFirst({
    where: { statementDate: { lte: dateOnly(asOf) } },
    orderBy: [{ statementDate: 'desc' }, { createdAt: 'desc' }],
  })
  if (!row) return null
  const statementDate = isoDateOf(row.statementDate)
  return {
    balanceId: row.balanceId, statementDate, balanceCents: fromBigInt(row.balanceCents), note: row.note,
    recordedBy: row.recordedBy, approvedBy: row.approvedBy, ageDays: daysBetween(statementDate, asOf),
  }
}

async function ledgerCash(db: Db, cutover: IsoDate, asOf: IsoDate): Promise<CashPosition> {
  const accounts = await Promise.all(
    Object.values(CASH_ACCOUNTS).map(async (code) => ({ code, cents: (await accountBalance(db, code, { asOf })).balance })),
  )
  // Withdrawals reach the ledger through the daily job until M5; count the
  // ones recorded since its last run as already paid out.
  const since = dayBefore(cutover)
  const withdrawals = (await db.withdrawal.findMany({
    where: { withdrawalDate: around(since, asOf), amount: { gt: 0 } },
    select: { withdrawalId: true, amount: true, withdrawalDate: true },
  })).filter((w) => onClubDays(w.withdrawalDate, since, asOf))
  const posted = new Set(
    (await db.journalEntry.findMany({
      where: { idempotencyKey: { in: withdrawals.map((w) => `withdrawal:${w.withdrawalId}`) } },
      select: { idempotencyKey: true },
    })).map((e) => e.idempotencyKey),
  )
  const unpostedWithdrawalsCents = sum(withdrawals.filter((w) => !posted.has(`withdrawal:${w.withdrawalId}`)).map((w) => centsOf(w.amount)))
  return {
    source: 'ledger',
    cents: subtract(sum(accounts.map((a) => a.cents)), unpostedWithdrawalsCents),
    accounts,
    unpostedWithdrawalsCents,
  }
}

async function bankBalanceCash(db: Db, balance: BankBalanceView, asOf: IsoDate): Promise<CashPosition> {
  // Money recorded on the club days after the statement day, up to asOf.
  const after = balance.statementDate
  const window = around(after, asOf)
  const inRange = (value: Date) => onClubDays(value, after, asOf)
  const [contributions, repayments, enginePayouts, olderPayouts, withdrawals] = await Promise.all([
    db.contribution.findMany({ where: { paymentDate: window, reversedAt: null, amountCents: { gt: 0 } }, select: { amountCents: true, paymentDate: true } })
      .then((rows) => rows.filter((r) => inRange(r.paymentDate))),
    db.loanPayment.findMany({ where: { paymentDate: window, amount: { gt: 0 } }, select: { amount: true, paymentDate: true } })
      .then((rows) => rows.filter((r) => inRange(r.paymentDate))),
    db.loan.findMany({ where: { disbursedOn: window, disbursedAmountCents: { not: null } }, select: { disbursedAmountCents: true, disbursedOn: true } })
      .then((rows) => rows.filter((r) => inRange(r.disbursedOn!))),
    // Loans made before the loan engine were paid out on their loan date.
    db.loan.findMany({ where: { loanDate: window, principalCents: null, lifecycle: { notIn: ['cancelled', ...COMMITTED_STAGES] } }, select: { loanAmount: true, loanDate: true } })
      .then((rows) => rows.filter((r) => inRange(r.loanDate))),
    db.withdrawal.findMany({ where: { withdrawalDate: window, amount: { gt: 0 } }, select: { amount: true, withdrawalDate: true } })
      .then((rows) => rows.filter((r) => inRange(r.withdrawalDate))),
  ])
  const movements = {
    contributions: contributions.map((c) => fromBigInt(c.amountCents)),
    loanRepayments: repayments.map((p) => centsOf(p.amount)),
    loanPayouts: [
      ...enginePayouts.map((l) => fromBigInt(l.disbursedAmountCents!)),
      ...olderPayouts.map((l) => centsOf(l.loanAmount)),
    ],
    withdrawals: withdrawals.map((w) => centsOf(w.amount)),
  }
  const total = (list: Cents[]) => ({ count: list.length, cents: sum(list) })
  return {
    source: 'bank_balance',
    cents: rollForward(balance.balanceCents, movements),
    balance,
    since: {
      contributions: total(movements.contributions),
      loanRepayments: total(movements.loanRepayments),
      loanPayouts: total(movements.loanPayouts),
      withdrawals: total(movements.withdrawals),
    },
  }
}

/** Member capital: the ledger once it holds it, otherwise the stored totals less withdrawals since the cutover. */
async function memberCapital(db: Db, opened: { cutover: IsoDate } | null, asOf: IsoDate): Promise<Cents> {
  if (opened) return (await accountBalance(db, MEMBER_CAPITAL, { asOf })).balance
  const since = dayBefore(DEFAULT_CUTOVER)
  const [members, withdrawals] = await Promise.all([
    db.member.findMany({ select: { overallContributions: true } }),
    db.withdrawal.findMany({ where: { withdrawalDate: around(since, asOf), amount: { gt: 0 } }, select: { amount: true, withdrawalDate: true } })
      .then((rows) => rows.filter((w) => onClubDays(w.withdrawalDate, since, asOf))),
  ])
  return subtract(sum(members.map((m) => centsOf(m.overallContributions))), sum(withdrawals.map((w) => centsOf(w.amount))))
}

/** The club's cash, reserve, commitments and lending capacity today. */
export async function treasuryPosition(db: Db, asOf: IsoDate = todayIso()): Promise<TreasuryPosition> {
  const opened = await ledgerOpening(db)
  const balance = opened ? null : await latestBankBalance(db, asOf)
  const cash: CashPosition = opened
    ? await ledgerCash(db, opened.cutover, asOf)
    : balance ? await bankBalanceCash(db, balance, asOf) : { source: 'unknown', cents: null }

  const from = monthsBefore(asOf, LIQUIDITY_POLICY.withdrawalLookbackMonths)
  const [capitalCents, recent, committedLoans] = await Promise.all([
    memberCapital(db, opened, asOf),
    db.withdrawal.findMany({ where: { withdrawalDate: around(from, asOf), amount: { gt: 0 } }, select: { amount: true, withdrawalDate: true } })
      .then((rows) => rows.filter((w) => onClubDays(w.withdrawalDate, from, asOf))),
    db.loan.findMany({
      where: { lifecycle: { in: COMMITTED_STAGES } },
      select: { loanId: true, borrowerName: true, lifecycle: true, loanAmount: true, principalCents: true, applicationFeeCents: true },
      orderBy: { loanId: 'asc' },
    }),
  ])
  const recentCents = sum(recent.map((w) => centsOf(w.amount)))
  const reserve = reserveFor(capitalCents, recentCents)
  const loans = committedLoans.map((l) => ({
    loanId: l.loanId, borrowerName: l.borrowerName, lifecycle: l.lifecycle,
    // Loans on the engine pay out the principal less the fee; an odd record
    // without amounts in cents counts in full, to be safe.
    payoutCents: l.principalCents === null
      ? centsOf(l.loanAmount)
      : subtract(fromBigInt(l.principalCents), fromBigInt(l.applicationFeeCents ?? BigInt(0))),
  }))
  const committedCents = sum(loans.map((l) => l.payoutCents))
  const capacityCents = cash.cents === null ? null : lendingCapacity(cash.cents, reserve.cents, committedCents)

  const warnings: string[] = []
  if (cash.source === 'unknown') {
    warnings.push('No bank balance has been recorded, so the lending capacity is unknown and no loan can be approved. Record the balance from the bank statement.')
  }
  if (cash.source === 'bank_balance' && cash.balance.ageDays > LIQUIDITY_POLICY.staleBalanceDays) {
    warnings.push(`The bank balance is ${cash.balance.ageDays} days old. Record a newer one: bank fees and anything not recorded here are missing from the cash figure.`)
  }
  if (cash.cents !== null && cash.cents < reserve.cents) {
    warnings.push(`Cash is below the minimum reserve by ${formatUSD(subtract(reserve.cents, cash.cents))}.`)
  }
  return {
    asOf, cash, memberCapitalCents: capitalCents, recentWithdrawals: { from, cents: recentCents },
    reserve, committed: { cents: committedCents, loans }, capacityCents, policy: LIQUIDITY_POLICY, warnings,
  }
}

/**
 * Refuses a loan whose payout does not fit in the lending capacity. Inside
 * a transaction, pass `lock` so two approvals cannot both use the same room.
 */
export async function checkLendingCapacity(db: Db, payoutCents: Cents, opts: { lock?: boolean } = {}) {
  if (opts.lock) await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('treasury.lending_capacity'))`
  const position = await treasuryPosition(db)
  const check = checkCapacity(position.capacityCents, payoutCents)
  if (check.ok) return position
  if (check.reason === 'unknown_cash') {
    throw new OperationError(409, 'The lending capacity is unknown: record the club’s bank balance on the Treasury page before approving loans.', { code: 'lending_capacity_unknown' })
  }
  throw new OperationError(
    409,
    `This loan pays out ${formatUSD(payoutCents)}, but the lending capacity is ${formatUSD(check.capacityCents)} (cash less the ${formatUSD(position.reserve.cents)} reserve and loans approved but not paid out).`,
    { code: 'over_lending_capacity', capacityCents: check.capacityCents, payoutCents, shortfallCents: check.shortfallCents },
  )
}

export type BankBalanceInput = {
  statementDate: IsoDate
  balanceCents: Cents
  note: string | null
}

/** Checks made before queueing for approval, and again when it runs. */
export function checkBankBalance(input: BankBalanceInput, today: IsoDate = todayIso()) {
  if (input.statementDate > today) throw new OperationError(400, 'The statement date cannot be in the future.')
  if (input.balanceCents < 0) throw new OperationError(400, 'The bank balance cannot be negative.')
}

export async function recordBankBalance(tx: Db, input: BankBalanceInput, actors: Actors, ctx: AuditContext) {
  checkBankBalance(input)
  const created = await tx.treasuryBankBalance.create({
    data: {
      balanceId: nextPublicId('BB'),
      statementDate: dateOnly(input.statementDate),
      balanceCents: toBigInt(input.balanceCents),
      note: input.note,
      recordedBy: actors.maker.id,
      approvedBy: actors.checker?.id ?? null,
    },
  })
  await recordAudit(tx, ctx, {
    action: 'treasury.bank_balance.record', entityType: 'treasury_bank_balance', entityId: created.balanceId, after: created,
    metadata: { statementDate: input.statementDate, balanceCents: input.balanceCents, maker: actors.maker.id, checker: actors.checker?.id ?? null },
  })
  return { ...created, balanceCents: input.balanceCents }
}

