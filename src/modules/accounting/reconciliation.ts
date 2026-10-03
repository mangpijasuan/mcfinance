// Reconciliation and month-end close (F-11, docs/architecture/04 §1 and §4,
// 08 §1 "Controls").
//
// - Money received waits in a clearing account until it reaches the bank:
//   1010 Stripe, 1020 Zelle / bank transfer, 1030 cash held by collectors.
//   A transfer (a Stripe payout, receipts swept to the bank, a collector's
//   deposit) moves it to 1000 Bank, with a checker when maker/checker is on.
// - Cash a collector holds is aged, oldest first, from the cash payments
//   they recorded less what they deposited.
// - Each month the Treasurer reconciles the bank statement against the
//   ledger's bank account; a month closes only when nothing differs and
//   nothing dated in it is still waiting for the ledger. Closed months
//   never reopen; later corrections post in the first open month.
import type { Prisma } from '@prisma/client'
import { type Cents, ZERO, add, formatUSD, fromBigInt, subtract, sum, toBigInt } from '@/lib/money'
import { type IsoDate, dateOnly, isoDateOf, todayIso } from '@/lib/dates'
import { nextPublicId } from '@/lib/publicIds'
import { OperationError } from '@/lib/operationError'
import { type AuditContext, recordAudit } from '@/modules/audit'
import type { Actors } from '@/modules/approvals/actors'
import { accountBalance, checkInvariants, lockPeriodsExclusive, lockPeriodsShared } from './ledger'
import { CASH_ACCOUNTS, ledgerOpening, openPostingDate, postMoneyEvent, receiptAccount } from './autoPost'
import { legacyCents } from './legacyActivity'
import { unpostedRecords } from './comparison'

type Db = Prisma.TransactionClient

export const CLEARING_ACCOUNTS = {
  [CASH_ACCOUNTS.stripeClearing]: 'Stripe',
  [CASH_ACCOUNTS.transferClearing]: 'Zelle / bank transfer',
  [CASH_ACCOUNTS.collectorCash]: 'Cash held by collectors',
} as const
export type ClearingAccount = keyof typeof CLEARING_ACCOUNTS

/** Cash held longer than this by a collector is flagged (docs/architecture/04 §1: "deposit within N days"). */
export const COLLECTOR_DEPOSIT_DAYS = 7

const DAY_MS = 86_400_000

// ── Pure helpers ────────────────────────────────────────────────────────

export function isClearingAccount(value: unknown): value is ClearingAccount {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CLEARING_ACCOUNTS, value)
}

export function isPeriod(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** The last calendar day of a month. */
export function periodEnd(period: string): IsoDate {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)
}

export type ReconcilingItem = { kind: 'deposit_in_transit' | 'outstanding_payment'; description: string; cents: Cents }

/**
 * The bank statement balance adjusted for timing (deposits the bank had not
 * yet credited, payments it had not yet paid) against the ledger. Zero
 * means the bank account is reconciled.
 */
export function reconciliationDifference(statementCents: Cents, items: readonly ReconcilingItem[], ledgerCents: Cents): Cents {
  const inTransit = sum(items.filter((i) => i.kind === 'deposit_in_transit').map((i) => i.cents))
  const outstanding = sum(items.filter((i) => i.kind === 'outstanding_payment').map((i) => i.cents))
  return subtract(subtract(add(statementCents, inTransit), outstanding), ledgerCents)
}

export type CashReceipt = { date: IsoDate; cents: Cents }
export type CollectorCash = { collector: string; receivedCents: Cents; depositedCents: Cents; heldCents: Cents; oldestHeld: IsoDate | null; ageDays: number | null; overdue: boolean }

/**
 * What a collector still holds, oldest first: deposits use up the earliest
 * receipts, and the oldest receipt not yet covered gives the age.
 */
export function collectorCash(collector: string, receipts: readonly CashReceipt[], depositedCents: Cents, asOf: IsoDate): CollectorCash {
  const ordered = [...receipts].sort((a, b) => a.date.localeCompare(b.date))
  const receivedCents = sum(ordered.map((r) => r.cents))
  let covered = depositedCents
  let oldestHeld: IsoDate | null = null
  for (const r of ordered) {
    if (covered >= r.cents) { covered = subtract(covered, r.cents); continue }
    oldestHeld = r.date
    break
  }
  const ageDays = oldestHeld === null ? null : Math.round((dateOnly(asOf).getTime() - dateOnly(oldestHeld).getTime()) / DAY_MS)
  return {
    collector, receivedCents, depositedCents, heldCents: subtract(receivedCents, depositedCents),
    oldestHeld, ageDays, overdue: ageDays !== null && ageDays > COLLECTOR_DEPOSIT_DAYS,
  }
}

export type Movement = { date: IsoDate; cents: Cents }

/**
 * How much can leave on `from` without the balance going below zero on any
 * day from then on: the balance at the end of `from`, then the lowest
 * end-of-day balance after it. Money that arrives later cannot fund an
 * earlier transfer, and money a later transfer already moved cannot be
 * moved again by a backdated one.
 */
export function availableFrom(movements: readonly Movement[], from: IsoDate): Cents {
  const byDay = new Map<IsoDate, Cents>()
  for (const m of movements) byDay.set(m.date, add(byDay.get(m.date) ?? ZERO, m.cents))
  const days = [...byDay.keys()].sort()
  let running = sum(days.filter((d) => d <= from).map((d) => byDay.get(d)!))
  let lowest = running
  for (const d of days.filter((x) => x > from)) {
    running = add(running, byDay.get(d)!)
    if (running < lowest) lowest = running
  }
  return lowest
}

// ── Reading ─────────────────────────────────────────────────────────────

const collectorName = (value: string | null) => value?.trim() || 'Not recorded'

type CollectorBook = Map<string, { receipts: CashReceipt[]; deposits: CashReceipt[] }>

/** Each collector's cash payments since the cutover and their deposits, dated. */
async function collectorBook(db: Db, cutover: IsoDate): Promise<CollectorBook> {
  const isCash = (method: string | null) => receiptAccount(method) === CASH_ACCOUNTS.collectorCash
  const [contributions, payments, deposits] = await Promise.all([
    db.contribution.findMany({ where: { amountCents: { gt: 0 }, reversedAt: null }, select: { paymentDate: true, amountCents: true, paymentMethod: true, receivedBy: true } }),
    db.loanPayment.findMany({ where: { amount: { gt: 0 } }, select: { paymentDate: true, amount: true, paymentMethod: true, receivedBy: true } }),
    db.clearingTransfer.findMany({ where: { fromAccount: CASH_ACCOUNTS.collectorCash }, select: { collector: true, amountCents: true, bankDate: true } }),
  ])
  const book: CollectorBook = new Map()
  const entry = (name: string) => {
    if (!book.has(name)) book.set(name, { receipts: [], deposits: [] })
    return book.get(name)!
  }
  const keep = (date: Date, amount: Cents, method: string | null, by: string | null) => {
    const day = isoDateOf(date)
    if (isCash(method) && day >= cutover) entry(collectorName(by)).receipts.push({ date: day, cents: amount })
  }
  for (const c of contributions) keep(c.paymentDate, fromBigInt(c.amountCents), c.paymentMethod, c.receivedBy)
  for (const p of payments) keep(p.paymentDate, legacyCents(p.amount).amount, p.paymentMethod, p.receivedBy)
  for (const d of deposits) entry(collectorName(d.collector)).deposits.push({ date: isoDateOf(d.bankDate), cents: fromBigInt(d.amountCents) })
  return book
}

/** What each collector holds as of a day: cash recorded up to then, less deposits up to then. */
async function collectorPositions(db: Db, cutover: IsoDate, asOf: IsoDate): Promise<CollectorCash[]> {
  const book = await collectorBook(db, cutover)
  return [...book.keys()].sort().map((name) => {
    const { receipts, deposits } = book.get(name)!
    const deposited = sum(deposits.filter((d) => d.date <= asOf).map((d) => d.cents))
    return collectorCash(name, receipts.filter((r) => r.date <= asOf), deposited, asOf)
  })
}

export type PeriodStatus = {
  period: string
  closed: boolean
  closedAt: string | null
  closedBy: string | null
  reconciliation: {
    statementDate: IsoDate; statementBalanceCents: Cents; ledgerBalanceCents: Cents; differenceCents: Cents
    items: ReconcilingItem[]; note: string | null; preparedBy: string; createdAt: string
  } | null
  /** Why it cannot close yet; only worked out for the next month to close. */
  blockers: string[] | null
}

/** Why a month cannot be closed yet (empty: it can). */
export async function closeBlockers(db: Db, period: string, today: IsoDate = todayIso()): Promise<string[]> {
  const opened = await ledgerOpening(db)
  if (!opened) return ['Opening balances are not posted yet (M4).']
  const first = isoDateOf(new Date(dateOnly(opened.cutover).getTime() - DAY_MS)).slice(0, 7)
  if (period < first) return [`The ledger starts in ${first}.`]
  const blockers: string[] = []
  const state = await db.ledgerPeriod.findUnique({ where: { period } })
  if (state?.status === 'closed') return [`${period} is already closed.`]
  if (periodEnd(period) >= today) blockers.push(`${period} has not ended yet.`)
  if (period > first) {
    const previous = await db.ledgerPeriod.findFirst({ where: { status: 'closed' }, orderBy: { period: 'desc' } })
    const wanted = previous ? nextPeriod(previous.period) : first
    if (wanted !== period) blockers.push(`Close ${wanted} first: months close in order.`)
  }
  const rec = await db.bankReconciliation.findFirst({ where: { period }, orderBy: { seq: 'desc' } })
  if (!rec) blockers.push('The bank account has not been reconciled for this month.')
  else if (rec.differenceCents !== BigInt(0)) blockers.push(`The latest bank reconciliation differs by ${formatUSD(fromBigInt(rec.differenceCents))}. Find the difference, post what is missing, and reconcile again.`)
  else {
    // Something posted into the month since (a late payment, a transfer) changes the bank balance it reconciled.
    const now = (await accountBalance(db, CASH_ACCOUNTS.bank, { asOf: periodEnd(period) })).balance
    const then = fromBigInt(rec.ledgerBalanceCents)
    if (now !== then) blockers.push(`The ledger's bank balance at ${periodEnd(period)} changed from ${formatUSD(then)} to ${formatUSD(now)} since the last reconciliation. Reconcile again.`)
  }
  const from = `${period}-01` < opened.cutover ? opened.cutover : `${period}-01`
  const unposted = from <= periodEnd(period) ? await unpostedRecords(db, from, periodEnd(period)) : []
  if (unposted.length > 0) blockers.push(`${unposted.length} money record(s) dated in ${period} are not in the ledger yet (see Ledger → Nightly comparison).`)
  const invariants = await checkInvariants(db)
  if (!invariants.ok) blockers.push(`The ledger breaks its own rules: ${invariants.problems.join('; ')}.`)
  return blockers
}

/** Clearing accounts, collector cash, transfers and the month-end status, as of today. */
export async function reconciliationStatus(db: Db, today: IsoDate = todayIso()) {
  const opened = await ledgerOpening(db)
  if (!opened) return { started: false as const }
  const clearing = await Promise.all((Object.keys(CLEARING_ACCOUNTS) as ClearingAccount[]).map(async (code) => ({
    code, name: CLEARING_ACCOUNTS[code], cents: (await accountBalance(db, code, { asOf: today })).balance,
  })))
  const bankCents = (await accountBalance(db, CASH_ACCOUNTS.bank, { asOf: today })).balance
  const collectors = await collectorPositions(db, opened.cutover, today)
  const transfers = (await db.clearingTransfer.findMany({ orderBy: [{ bankDate: 'desc' }, { createdAt: 'desc' }], take: 50 })).map((t) => ({
    transferId: t.transferId, fromAccount: t.fromAccount, amountCents: fromBigInt(t.amountCents), bankDate: isoDateOf(t.bankDate),
    reference: t.reference, collector: t.collector, note: t.note, journalEntry: t.journalEntry, recordedBy: t.recordedBy, approvedBy: t.approvedBy,
  }))

  const first = isoDateOf(new Date(dateOnly(opened.cutover).getTime() - DAY_MS)).slice(0, 7)
  const lastEnded = isoDateOf(new Date(dateOnly(`${today.slice(0, 7)}-01`).getTime() - DAY_MS)).slice(0, 7)
  const [states, recs] = await Promise.all([
    db.ledgerPeriod.findMany({ where: { period: { gte: first } } }),
    db.bankReconciliation.findMany({ where: { period: { gte: first } }, orderBy: { seq: 'desc' } }),
  ])
  const periods: PeriodStatus[] = []
  let nextToClose: string | null = null
  for (let p = first; p <= lastEnded; p = nextPeriod(p)) {
    const state = states.find((s) => s.period === p)
    const rec = recs.find((r) => r.period === p)
    const closed = state?.status === 'closed'
    if (!closed && nextToClose === null) nextToClose = p
    periods.push({
      period: p, closed, closedAt: state?.closedAt?.toISOString() ?? null, closedBy: state?.closedBy ?? null,
      reconciliation: rec ? {
        statementDate: isoDateOf(rec.statementDate), statementBalanceCents: fromBigInt(rec.statementBalanceCents),
        ledgerBalanceCents: fromBigInt(rec.ledgerBalanceCents), differenceCents: fromBigInt(rec.differenceCents),
        items: rec.items as unknown as ReconcilingItem[], note: rec.note, preparedBy: rec.preparedBy, createdAt: rec.createdAt.toISOString(),
      } : null,
      blockers: p === nextToClose ? await closeBlockers(db, p, today) : null,
    })
  }
  return { started: true as const, cutover: opened.cutover, bankCents, clearing, collectors, transfers, periods: periods.reverse(), depositDays: COLLECTOR_DEPOSIT_DAYS }
}

// ── Transfers to the bank ───────────────────────────────────────────────

export type TransferInput = {
  fromAccount: ClearingAccount
  amountCents: Cents
  bankDate: IsoDate
  reference: string | null
  collector: string | null
  note: string | null
}

/** Checks made before queueing for approval, and again when it runs. */
export async function checkTransfer(db: Db, input: TransferInput, today: IsoDate = todayIso()) {
  const opened = await ledgerOpening(db)
  if (!opened) throw new OperationError(409, 'Transfers are recorded in the ledger, which starts with the opening balances (M4).')
  if (input.amountCents <= 0) throw new OperationError(400, 'The amount must be more than zero.')
  if (input.bankDate > today) throw new OperationError(400, 'The bank date cannot be in the future.')
  if (input.bankDate < opened.cutover) throw new OperationError(400, `The bank date must be on or after the ledger's start (${opened.cutover}).`)
  if (input.fromAccount === CASH_ACCOUNTS.collectorCash && !input.collector) throw new OperationError(400, 'Name the collector who deposited the cash.')
  // The day it will post on (the first open day, if the bank date's month is closed).
  const postOn = await openPostingDate(db, input.bankDate)
  const lines = await db.journalLine.findMany({
    where: { accountCode: input.fromAccount },
    select: { debitCents: true, creditCents: true, entry: { select: { effectiveDate: true } } },
  })
  const inLedger = availableFrom(lines.map((l) => ({ date: isoDateOf(l.entry.effectiveDate), cents: subtract(fromBigInt(l.debitCents), fromBigInt(l.creditCents)) })), postOn)
  if (input.amountCents > inLedger) {
    throw new OperationError(409, `${CLEARING_ACCOUNTS[input.fromAccount]} holds ${formatUSD(inLedger)} in the ledger on ${postOn}, counting later transfers; a transfer cannot move more than that.`)
  }
  if (input.fromAccount === CASH_ACCOUNTS.collectorCash) {
    const mine = (await collectorBook(db, opened.cutover)).get(input.collector!) ?? { receipts: [], deposits: [] }
    const held = availableFrom([...mine.receipts, ...mine.deposits.map((d) => ({ date: d.date, cents: subtract(ZERO, d.cents) }))], postOn)
    if (input.amountCents > held) throw new OperationError(409, `${input.collector} holds ${formatUSD(held)} in recorded cash on ${postOn}, counting later deposits; the deposit cannot be more than that.`)
  }
}

export async function recordTransfer(tx: Db, input: TransferInput, actors: Actors, ctx: AuditContext) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('reconciliation.transfer'))`
  await checkTransfer(tx, input)
  const transferId = nextPublicId('TR')
  const label = CLEARING_ACCOUNTS[input.fromAccount]
  const { entryNumber } = await postMoneyEvent(tx, {
    effectiveDate: input.bankDate,
    type: input.fromAccount === CASH_ACCOUNTS.collectorCash ? 'deposit' : 'transfer',
    description: input.fromAccount === CASH_ACCOUNTS.collectorCash
      ? `Cash deposited by ${input.collector} (${transferId})`
      : `${label} to the bank (${transferId})`,
    reference: input.reference,
    source: { type: 'clearing_transfer', id: transferId },
    idempotencyKey: `transfer:${transferId}`,
    lines: [
      { account: CASH_ACCOUNTS.bank, debit: input.amountCents },
      { account: input.fromAccount, credit: input.amountCents, ...(input.collector ? { memo: `Collector: ${input.collector}` } : {}) },
    ],
    createdBy: actors.maker.id,
    approvedBy: actors.checker?.id ?? null,
  })
  const created = await tx.clearingTransfer.create({
    data: {
      transferId, fromAccount: input.fromAccount, amountCents: toBigInt(input.amountCents), bankDate: dateOnly(input.bankDate),
      reference: input.reference, collector: input.collector, note: input.note, journalEntry: entryNumber,
      recordedBy: actors.maker.id, approvedBy: actors.checker?.id ?? null,
    },
  })
  await recordAudit(tx, ctx, {
    action: 'reconciliation.transfer.record', entityType: 'clearing_transfer', entityId: transferId, after: created,
    metadata: { maker: actors.maker.id, checker: actors.checker?.id ?? null },
  })
  return { ...created, amountCents: input.amountCents }
}

// ── Bank reconciliation ─────────────────────────────────────────────────

export type BankReconciliationInput = {
  period: string
  statementBalanceCents: Cents
  items: ReconcilingItem[]
  note: string | null
}

export async function reconcileBank(tx: Db, input: BankReconciliationInput, preparedBy: string, ctx: AuditContext, today: IsoDate = todayIso()) {
  // Waits for a close in progress, and makes a close wait for this.
  await lockPeriodsShared(tx)
  const opened = await ledgerOpening(tx)
  if (!opened) throw new OperationError(409, 'The bank is reconciled against the ledger, which starts with the opening balances (M4).')
  const statementDate = periodEnd(input.period)
  if (statementDate >= today) throw new OperationError(400, `${input.period} has not ended yet.`)
  const first = isoDateOf(new Date(dateOnly(opened.cutover).getTime() - DAY_MS)).slice(0, 7)
  if (input.period < first) throw new OperationError(400, `The ledger starts in ${first}.`)
  if ((await tx.ledgerPeriod.findUnique({ where: { period: input.period } }))?.status === 'closed') {
    throw new OperationError(409, `${input.period} is closed.`)
  }
  const ledgerBalanceCents = (await accountBalance(tx, CASH_ACCOUNTS.bank, { asOf: statementDate })).balance
  const differenceCents = reconciliationDifference(input.statementBalanceCents, input.items, ledgerBalanceCents)
  const created = await tx.bankReconciliation.create({
    data: {
      period: input.period, statementDate: dateOnly(statementDate),
      statementBalanceCents: toBigInt(input.statementBalanceCents), ledgerBalanceCents: toBigInt(ledgerBalanceCents),
      items: input.items as unknown as Prisma.InputJsonValue, differenceCents: toBigInt(differenceCents), note: input.note, preparedBy,
    },
  })
  await recordAudit(tx, ctx, {
    action: 'reconciliation.bank.record', entityType: 'bank_reconciliation', entityId: input.period, after: created,
    metadata: { statementBalanceCents: input.statementBalanceCents, ledgerBalanceCents, differenceCents },
  })
  return { period: input.period, statementDate, statementBalanceCents: input.statementBalanceCents, ledgerBalanceCents, differenceCents, items: input.items }
}

// ── Month-end close ─────────────────────────────────────────────────────

export async function closePeriod(tx: Db, period: string, closedBy: string, ctx: AuditContext, today: IsoDate = todayIso()) {
  // Waits for every posting and reconciliation in flight; new ones wait for this close.
  await lockPeriodsExclusive(tx)
  const blockers = await closeBlockers(tx, period, today)
  if (blockers.length > 0) throw new OperationError(409, `${period} cannot be closed yet.`, { blockers })
  const closedAt = new Date()
  await tx.ledgerPeriod.upsert({
    where: { period },
    create: { period, status: 'closed', closedAt, closedBy },
    update: { status: 'closed', closedAt, closedBy },
  })
  await recordAudit(tx, ctx, { action: 'ledger.period.close', entityType: 'ledger_period', entityId: period, after: { period, closedAt, closedBy } })
  return { period, closedAt: closedAt.toISOString(), closedBy }
}

