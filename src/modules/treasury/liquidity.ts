// Liquidity policy (Gate #1 A10, docs/architecture/08 §1). Pure arithmetic
// in cents; ./index reads the figures from the database.
//
// Members can withdraw capital that is lent out to other members for up to
// 24 months. A minimum cash reserve is kept for withdrawals and never lent
// out, and new loans are approved only within the lending capacity left
// after the reserve and the loans already approved but not yet paid out.
import { type Cents, ZERO, add, cents, max, subtract, sum } from '@/lib/money'

/**
 * The starting values the founder approved (A10). Changing them is a board
 * decision; they are code so every change is reviewed.
 */
export const LIQUIDITY_POLICY = {
  /** The reserve is at least this share of member capital… */
  reserveCapitalPercent: 15,
  /** …or this many months of withdrawals, whichever is larger… */
  reserveWithdrawalMonths: 3,
  /** …averaged over this many months. */
  withdrawalLookbackMonths: 12,
  /** A recorded bank balance older than this many days is flagged as stale. */
  staleBalanceDays: 35,
} as const

/** `amount × numerator / denominator`, rounded up to the cent (a reserve errs on the safe side). */
function shareRoundedUp(amount: Cents, numerator: number, denominator: number): Cents {
  if (amount <= 0) return ZERO
  return cents(Math.ceil((amount * numerator) / denominator))
}

export type Reserve = {
  cents: Cents
  byCapitalCents: Cents
  byWithdrawalsCents: Cents
  basis: 'capital' | 'withdrawals'
}

/** The minimum cash reserve: the greater of a share of member capital or months of withdrawals. */
export function reserveFor(memberCapitalCents: Cents, recentWithdrawalsCents: Cents): Reserve {
  const p = LIQUIDITY_POLICY
  const byCapitalCents = shareRoundedUp(memberCapitalCents, p.reserveCapitalPercent, 100)
  const byWithdrawalsCents = shareRoundedUp(recentWithdrawalsCents, p.reserveWithdrawalMonths, p.withdrawalLookbackMonths)
  const basis = byWithdrawalsCents > byCapitalCents ? 'withdrawals' : 'capital'
  return { cents: max(byCapitalCents, byWithdrawalsCents), byCapitalCents, byWithdrawalsCents, basis }
}

/** Cash − reserve − loans approved but not yet paid out. Negative means the club is short. */
export function lendingCapacity(cashCents: Cents, reserveCents: Cents, committedCents: Cents): Cents {
  return subtract(subtract(cashCents, reserveCents), committedCents)
}

export type Movements = {
  contributions: Cents[]
  loanRepayments: Cents[]
  loanPayouts: Cents[]
  withdrawals: Cents[]
}

/** A bank balance carried forward with the money recorded since: in minus out. */
export function rollForward(balanceCents: Cents, since: Movements): Cents {
  const inflows = add(sum(since.contributions), sum(since.loanRepayments))
  const outflows = add(sum(since.loanPayouts), sum(since.withdrawals))
  return subtract(add(balanceCents, inflows), outflows)
}

export type CapacityCheck =
  | { ok: true; capacityCents: Cents }
  | { ok: false; reason: 'unknown_cash' }
  | { ok: false; reason: 'over_capacity'; capacityCents: Cents; shortfallCents: Cents }

/** May a loan paying out `payoutCents` be approved? */
export function checkCapacity(capacityCents: Cents | null, payoutCents: Cents): CapacityCheck {
  if (capacityCents === null) return { ok: false, reason: 'unknown_cash' }
  if (payoutCents > capacityCents) {
    return { ok: false, reason: 'over_capacity', capacityCents, shortfallCents: subtract(payoutCents, capacityCents) }
  }
  return { ok: true, capacityCents }
}
