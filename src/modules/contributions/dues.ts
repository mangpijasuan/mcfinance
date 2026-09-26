// Dues: what a member owes month by month, and which months their
// payments cover (docs/architecture/04 §1). Pure functions, no database.
//
// Payments cover obligations **oldest first**, the same rule as loan
// repayments (Gate #1 A6); anything beyond the obligations so far is a
// credit that covers the next months as they fall due (prepayment). The
// payment date is when money arrived; the period is what it paid for
// (F-10).
import { type Cents, ZERO, add, min, subtract, sum } from '@/lib/money'

/** A calendar month, "YYYY-MM". */
export type Period = string

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export class DuesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DuesError'
  }
}

export function isPeriod(value: unknown): value is Period {
  return typeof value === 'string' && PERIOD.test(value)
}

function parts(period: Period): { y: number; m: number } {
  const match = PERIOD.exec(period)
  if (!match) throw new DuesError(`not a period (YYYY-MM): "${period}"`)
  return { y: Number(match[1]), m: Number(match[2]) }
}

/** The period of an ISO date ("2026-03-10" → "2026-03"). */
export function periodOf(isoDate: string): Period {
  const period = isoDate.slice(0, 7)
  parts(period)
  return period
}

export function addPeriods(period: Period, n: number): Period {
  const { y, m } = parts(period)
  const index = y * 12 + (m - 1) + n
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** Every period from a to b inclusive (empty if b is before a). */
export function periodsBetween(a: Period, b: Period): Period[] {
  const out: Period[] = []
  for (let p = a; p <= b; p = addPeriods(p, 1)) out.push(p)
  return out
}

export function periodLabel(period: Period): string {
  const { y, m } = parts(period)
  return `${MONTHS[m - 1]} ${y}`
}

export const laterPeriod = (a: Period, b: Period): Period => (a > b ? a : b)

// ── Plans ──────────────────────────────────────────────────────────────

export type PlanRow = { startPeriod: Period; amount: Cents }

/** The plan amount in force for a period: the latest plan starting on or before it. */
export function planAmountFor(plans: readonly PlanRow[], period: Period): Cents | null {
  let found: PlanRow | null = null
  for (const plan of plans) {
    if (plan.startPeriod <= period && (!found || plan.startPeriod > found.startPeriod)) found = plan
  }
  return found ? found.amount : null
}

// ── Coverage ───────────────────────────────────────────────────────────

export type Obligation = { period: Period; amount: Cents }
export type Payment = { id: string; amount: Cents }

export type ObligationStatus = 'paid' | 'partly_paid' | 'overdue' | 'due' | 'upcoming'

export type ObligationView = Obligation & { paid: Cents; remaining: Cents; status: ObligationStatus }

export type DuesStatus = {
  obligations: ObligationView[]
  /** Paid beyond every obligation so far; covers the next months. */
  credit: Cents
  totalDue: Cents
  totalPaid: Cents
  /** Unpaid obligations for months before the current one. */
  arrears: Cents
  overduePeriods: Period[]
  /** The last month paid in full with no gap before it (null if none). */
  paidThrough: Period | null
  /** Whether the current month is paid (null: no obligation this month). */
  currentPaid: boolean | null
  /** What each payment paid, in the order given. */
  allocations: Map<string, { period: Period; amount: Cents }[]>
}

/**
 * Apply payments (in the order they were recorded) to obligations, oldest
 * month first. Which months are covered depends only on the total paid;
 * the order only decides which payment is shown against which month.
 */
export function duesStatus(input: { obligations: readonly Obligation[]; payments: readonly Payment[]; currentPeriod: Period }): DuesStatus {
  parts(input.currentPeriod)
  const obligations = [...input.obligations].sort((a, b) => (a.period < b.period ? -1 : 1))
  obligations.forEach((o, i) => {
    parts(o.period)
    if (!Number.isSafeInteger(o.amount) || o.amount <= 0) throw new DuesError(`${o.period}: amount must be a positive number of cents`)
    if (i > 0 && obligations[i - 1].period === o.period) throw new DuesError(`two obligations for ${o.period}`)
  })
  input.payments.forEach((p) => {
    if (!Number.isSafeInteger(p.amount) || p.amount <= 0) throw new DuesError(`payment ${p.id}: amount must be a positive number of cents`)
  })

  const paid = obligations.map(() => ZERO)
  const allocations = new Map<string, { period: Period; amount: Cents }[]>()
  let next = 0
  let credit = ZERO
  for (const payment of input.payments) {
    let left = payment.amount
    const split: { period: Period; amount: Cents }[] = []
    while (left > 0 && next < obligations.length) {
      const take = min(left, subtract(obligations[next].amount, paid[next]))
      paid[next] = add(paid[next], take)
      left = subtract(left, take)
      split.push({ period: obligations[next].period, amount: take })
      if (paid[next] === obligations[next].amount) next++
    }
    credit = add(credit, left)
    allocations.set(payment.id, split)
  }

  const views = obligations.map((o, i): ObligationView => {
    const remaining = subtract(o.amount, paid[i])
    const status: ObligationStatus = remaining === 0 ? 'paid'
      : o.period < input.currentPeriod ? 'overdue'
      : o.period > input.currentPeriod ? 'upcoming'
      : paid[i] > 0 ? 'partly_paid' : 'due'
    return { ...o, paid: paid[i], remaining, status }
  })
  const overdue = views.filter((v) => v.status === 'overdue')
  const firstUnpaid = views.findIndex((v) => v.remaining > 0)
  const lastFull = firstUnpaid === -1 ? views.length - 1 : firstUnpaid - 1
  const current = views.find((v) => v.period === input.currentPeriod)
  return {
    obligations: views,
    credit,
    totalDue: sum(views.map((v) => v.amount)),
    totalPaid: sum(input.payments.map((p) => p.amount)),
    arrears: sum(overdue.map((v) => v.remaining)),
    overduePeriods: overdue.map((v) => v.period),
    paidThrough: lastFull >= 0 ? views[lastFull].period : null,
    currentPaid: current ? current.remaining === 0 : null,
    allocations,
  }
}

/**
 * The last month covered, counting the credit against the plan amount for
 * the months after the last obligation (null if nothing is covered).
 */
export function coveredThrough(status: DuesStatus, plans: readonly PlanRow[]): Period | null {
  const last = status.obligations[status.obligations.length - 1]
  if (!last || last.remaining > 0) return status.paidThrough
  let period = last.period
  let credit = status.credit
  for (let guard = 0; guard < 600; guard++) {
    const amount = planAmountFor(plans, addPeriods(period, 1))
    if (!amount || credit < amount) break
    credit = subtract(credit, amount)
    period = addPeriods(period, 1)
  }
  return period
}

/** "Jan 2026", "Jan – Mar 2026", "Nov 2026 – Jan 2027". */
export function periodRangeLabel(periods: readonly Period[]): string {
  if (periods.length === 0) return ''
  const first = periods[0]
  const last = periods[periods.length - 1]
  if (first === last) return periodLabel(first)
  const [fm, fy] = periodLabel(first).split(' ')
  return fy === last.slice(0, 4) ? `${fm} – ${periodLabel(last)}` : `${periodLabel(first)} – ${periodLabel(last)}`
}

/** Aging bucket for arrears reports: months behind. */
export function agingBucket(overdueMonths: number): '1 month' | '2–3 months' | '4+ months' | null {
  if (overdueMonths <= 0) return null
  if (overdueMonths === 1) return '1 month'
  return overdueMonths <= 3 ? '2–3 months' : '4+ months'
}
