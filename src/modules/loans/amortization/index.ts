// Loan calculation engine (D-08; docs/architecture/04 §3). Pure functions,
// no database access: the same inputs always give the same outputs.
//
// - buildSchedule: zero-interest amortisation in integer cents. Every
//   installment gets the floor share and the LAST installment absorbs the
//   remainder, so a schedule always sums exactly to the principal.
// - applyPayment: splits a payment in the approved order (Gate #1 A6):
//   fees → oldest overdue installments → the current installment →
//   excess (prepay the next installments, or reduce the term from the end).
// - delinquency / lateFeesDue / payoffAmount: read the position as of a date.
//
// Dates are ISO calendar dates ("2026-03-10") so time zones never shift a
// due date.
import { type Cents, MoneyError, ZERO, add, cents, min, splitEvenly, subtract, sum } from '@/lib/money'

export const POLICY_VERSION = 'loan-policy-2026.1'
export const DEFAULT_DUE_DAY = 10
export const DEFAULT_GRACE_DAYS = 15

export type IsoDate = string

export class LoanEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoanEngineError'
  }
}

// ── Dates ──────────────────────────────────────────────────────────────

function parseIso(date: IsoDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new LoanEngineError(`not an ISO date: "${date}"`)
  const [y, m, d] = match.slice(1).map(Number)
  const check = new Date(Date.UTC(y, m - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new LoanEngineError(`not a real date: "${date}"`)
  }
  return { y, m, d }
}

function iso(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const pa = parseIso(a)
  const pb = parseIso(b)
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000)
}

function addMonthsOnDay(date: IsoDate, months: number, day: number): IsoDate {
  const { y, m } = parseIso(date)
  const index = y * 12 + (m - 1) + months
  return iso(Math.floor(index / 12), (index % 12) + 1, day)
}

// ── Schedule ───────────────────────────────────────────────────────────

export type ScheduleInput = {
  principal: Cents
  /** Number of monthly installments (the term). */
  installments: number
  /** The date the loan was made; the first installment is due the next month. */
  loanDate: IsoDate
  /** Day of the month installments fall due (policy: the 10th). 1–28. */
  dueDay?: number
  /** Interest in basis points. Only 0 is supported (D-08). */
  interestRateBps?: number
}

export type Installment = {
  number: number
  dueDate: IsoDate
  principal: Cents
  interest: Cents
  total: Cents
}

export type Schedule = {
  installments: Installment[]
  totalPrincipal: Cents
  totalRepayable: Cents
  policyVersion: string
}

export function buildSchedule(input: ScheduleInput): Schedule {
  const { principal, installments: count, loanDate } = input
  const dueDay = input.dueDay ?? DEFAULT_DUE_DAY
  if (!Number.isSafeInteger(principal) || principal <= 0) throw new LoanEngineError('principal must be a positive number of cents')
  if (!Number.isSafeInteger(count) || count < 1 || count > 360) throw new LoanEngineError('installments must be a whole number from 1 to 360')
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new LoanEngineError('dueDay must be 1–28 so it exists in every month')
  if ((input.interestRateBps ?? 0) !== 0) {
    throw new LoanEngineError('interest is not enabled: it needs a new policy version and legal review (D-08)')
  }
  parseIso(loanDate)

  const parts = splitEvenly(principal, count, 'last')
  const installments = parts.map((part, i) => ({
    number: i + 1,
    dueDate: addMonthsOnDay(loanDate, i + 1, dueDay),
    principal: part,
    interest: ZERO,
    total: part,
  }))
  return { installments, totalPrincipal: principal, totalRepayable: principal, policyVersion: POLICY_VERSION }
}

// ── Position and payments ──────────────────────────────────────────────

/** Where a loan stands: principal paid per installment, and unpaid fees. */
export type LoanPosition = {
  schedule: Schedule
  paid: Cents[]
  feesOutstanding: Cents
}

export function openPosition(schedule: Schedule): LoanPosition {
  return { schedule, paid: schedule.installments.map(() => ZERO), feesOutstanding: ZERO }
}

function assertPosition(position: LoanPosition) {
  const { schedule, paid, feesOutstanding } = position
  if (paid.length !== schedule.installments.length) throw new LoanEngineError('paid does not match the schedule')
  paid.forEach((p, i) => {
    if (!Number.isSafeInteger(p) || p < 0 || p > schedule.installments[i].principal) {
      throw new LoanEngineError(`installment ${i + 1}: paid amount out of range`)
    }
  })
  if (!Number.isSafeInteger(feesOutstanding) || feesOutstanding < 0) throw new LoanEngineError('feesOutstanding must be ≥ 0')
}

const remaining = (position: LoanPosition, i: number) =>
  subtract(position.schedule.installments[i].principal, position.paid[i])

export function outstandingPrincipal(position: LoanPosition): Cents {
  return subtract(position.schedule.totalPrincipal, sum(position.paid))
}

/** What the borrower owes to close the loan today: principal plus unpaid fees. */
export function payoffAmount(position: LoanPosition): Cents {
  return add(outstandingPrincipal(position), position.feesOutstanding)
}

export type AllocationKind = 'fee' | 'overdue' | 'current' | 'prepay'
export type Allocation = { kind: AllocationKind; installment?: number; amount: Cents }

/**
 * - prepay_next (default): excess pays the next installments in order, so
 *   the borrower is ahead of schedule.
 * - reduce_term: excess pays installments from the end, shortening the loan.
 */
export type ExcessRule = 'prepay_next' | 'reduce_term'

export type PaymentResult = {
  allocations: Allocation[]
  position: LoanPosition
  /** Anything beyond fees and principal (an overpayment); held as unapplied. */
  unapplied: Cents
}

export function applyPayment(position: LoanPosition, amount: Cents, asOf: IsoDate, excess: ExcessRule = 'prepay_next'): PaymentResult {
  assertPosition(position)
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new MoneyError('payment must be a positive number of cents')
  parseIso(asOf)

  const paid = [...position.paid]
  const allocations: Allocation[] = []
  let left = amount

  const payInstallment = (i: number, kind: AllocationKind) => {
    const due = subtract(position.schedule.installments[i].principal, paid[i])
    const take = min(left as Cents, due)
    if (take > 0) {
      paid[i] = add(paid[i], take)
      left = subtract(left as Cents, take)
      allocations.push({ kind, installment: i + 1, amount: take })
    }
  }

  // 1. Fees
  const fee = min(amount, position.feesOutstanding)
  if (fee > 0) {
    allocations.push({ kind: 'fee', amount: fee })
    left = subtract(left as Cents, fee)
  }
  const feesOutstanding = subtract(position.feesOutstanding, fee)

  const items = position.schedule.installments
  // 2. Overdue installments, oldest first
  for (let i = 0; i < items.length && left > 0; i++) {
    if (items[i].dueDate < asOf) payInstallment(i, 'overdue')
  }
  // 3. The current installment: the first unpaid one due on or after asOf
  const current = items.findIndex((it, i) => it.dueDate >= asOf && paid[i] < it.principal)
  if (current >= 0 && left > 0) payInstallment(current, 'current')
  // 4. Excess
  const order = items.map((_, i) => i)
  if (excess === 'reduce_term') order.reverse()
  for (const i of order) {
    if (left <= 0) break
    payInstallment(i, 'prepay')
  }

  return {
    allocations,
    position: { schedule: position.schedule, paid, feesOutstanding },
    unapplied: cents(left),
  }
}

/** Add a charged fee (for example a late fee) to the position. */
export function chargeFee(position: LoanPosition, fee: Cents): LoanPosition {
  if (!Number.isSafeInteger(fee) || fee <= 0) throw new MoneyError('fee must be a positive number of cents')
  return { ...position, feesOutstanding: add(position.feesOutstanding, fee) }
}

/** Remove a waived fee from the position; it must still be unpaid. */
export function waiveFee(position: LoanPosition, fee: Cents): LoanPosition {
  if (!Number.isSafeInteger(fee) || fee <= 0) throw new MoneyError('fee must be a positive number of cents')
  if (fee > position.feesOutstanding) throw new LoanEngineError('cannot waive more than the unpaid fees')
  return { ...position, feesOutstanding: subtract(position.feesOutstanding, fee) }
}

// ── Delinquency and late fees ──────────────────────────────────────────

export type Delinquency = {
  status: 'paid_off' | 'current' | 'delinquent'
  /** Days since the oldest unpaid installment fell due (0 if none is due). */
  daysPastDue: number
  overdueInstallments: number[]
  overdueAmount: Cents
}

export function delinquency(position: LoanPosition, asOf: IsoDate, graceDays = DEFAULT_GRACE_DAYS): Delinquency {
  assertPosition(position)
  parseIso(asOf)
  if (outstandingPrincipal(position) === 0) {
    return { status: 'paid_off', daysPastDue: 0, overdueInstallments: [], overdueAmount: ZERO }
  }
  const overdue = position.schedule.installments
    .map((it, i) => ({ it, i }))
    .filter(({ it, i }) => it.dueDate < asOf && position.paid[i] < it.principal)
  const daysPastDue = overdue.length ? daysBetween(overdue[0].it.dueDate, asOf) : 0
  return {
    status: daysPastDue > graceDays ? 'delinquent' : 'current',
    daysPastDue,
    overdueInstallments: overdue.map(({ it }) => it.number),
    overdueAmount: sum(overdue.map(({ i }) => remaining(position, i))),
  }
}

/**
 * Installments that newly qualify for a late fee as of a date: still
 * unpaid more than `graceDays` after falling due, and not charged before.
 * Each installment is charged at most once (pass the ones already charged).
 * Whether fees are actually charged is a policy switch (Gate #1 A7).
 */
export function lateFeesDue(
  position: LoanPosition,
  asOf: IsoDate,
  opts: { graceDays?: number; alreadyCharged: readonly number[] },
): number[] {
  assertPosition(position)
  const grace = opts.graceDays ?? DEFAULT_GRACE_DAYS
  const charged = new Set(opts.alreadyCharged)
  return position.schedule.installments
    .filter((it, i) => position.paid[i] < it.principal && daysBetween(it.dueDate, asOf) > grace && !charged.has(it.number))
    .map((it) => it.number)
}

// ── Replay ─────────────────────────────────────────────────────────────

export type LoanEvent =
  | { type: 'payment'; amount: Cents; asOf: IsoDate; excess?: ExcessRule }
  | { type: 'fee'; amount: Cents }
  | { type: 'fee_waiver'; amount: Cents }

/**
 * The position after a list of events, from scratch. Positions are always
 * derived, never stored: reversing a payment means replaying without it,
 * which restores the exact prior state.
 */
export function replay(schedule: Schedule, events: readonly LoanEvent[]) {
  let position = openPosition(schedule)
  let unapplied = ZERO
  const allocations: Allocation[][] = []
  for (const event of events) {
    if (event.type === 'fee') {
      position = chargeFee(position, event.amount)
      allocations.push([])
    } else if (event.type === 'fee_waiver') {
      position = waiveFee(position, event.amount)
      allocations.push([])
    } else {
      const result = applyPayment(position, event.amount, event.asOf, event.excess)
      position = result.position
      unapplied = add(unapplied, result.unapplied)
      allocations.push(result.allocations)
    }
  }
  return { position, unapplied, allocations }
}
