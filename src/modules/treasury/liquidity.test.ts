import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { type Cents, cents } from '@/lib/money'
import { LIQUIDITY_POLICY, checkCapacity, lendingCapacity, reserveFor, rollForward } from './liquidity'

const c = (n: number) => cents(n)

describe('reserveFor', () => {
  it('is 15% of member capital when that is larger', () => {
    expect(reserveFor(c(171_960_00), c(12_000_00))).toEqual({
      cents: 25_794_00, byCapitalCents: 25_794_00, byWithdrawalsCents: 3_000_00, basis: 'capital',
    })
  })

  it('is three months of the average monthly withdrawals when that is larger', () => {
    // $120,000 over 12 months = $10,000 a month; three months = $30,000.
    expect(reserveFor(c(100_000_00), c(120_000_00))).toEqual({
      cents: 30_000_00, byCapitalCents: 15_000_00, byWithdrawalsCents: 30_000_00, basis: 'withdrawals',
    })
  })

  it('rounds each share up to the cent', () => {
    expect(reserveFor(c(1), c(1))).toEqual({ cents: 1, byCapitalCents: 1, byWithdrawalsCents: 1, basis: 'capital' })
    expect(reserveFor(c(7), c(0)).byCapitalCents).toBe(2) // 1.05 → 2
  })

  it('is zero for no capital and no withdrawals, and never negative', () => {
    expect(reserveFor(c(0), c(0)).cents).toBe(0)
    expect(reserveFor(c(-500), c(-500)).cents).toBe(0)
  })

  it('is never below either share (property)', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 10_000_000_00 }), fc.integer({ min: 0, max: 10_000_000_00 }), (capital, withdrawn) => {
      const r = reserveFor(c(capital), c(withdrawn))
      expect(r.cents).toBe(Math.max(r.byCapitalCents, r.byWithdrawalsCents))
      expect(r.byCapitalCents * 100).toBeGreaterThanOrEqual(capital * LIQUIDITY_POLICY.reserveCapitalPercent)
      expect(r.byCapitalCents * 100 - capital * LIQUIDITY_POLICY.reserveCapitalPercent).toBeLessThan(100)
      expect(Number.isInteger(r.cents)).toBe(true)
    }))
  })
})

describe('lendingCapacity', () => {
  it('is cash less the reserve less approved payouts', () => {
    expect(lendingCapacity(c(50_000_00), c(25_794_00), c(4_970_00))).toBe(19_236_00)
  })

  it('goes negative when the club is short', () => {
    expect(lendingCapacity(c(20_000_00), c(25_794_00), c(0))).toBe(-5_794_00)
  })
})

describe('rollForward', () => {
  it('adds money in and takes money out', () => {
    const since = {
      contributions: [c(20_00), c(40_00)],
      loanRepayments: [c(100_00)],
      loanPayouts: [c(970_00)],
      withdrawals: [c(500_00)],
    }
    expect(rollForward(c(10_000_00), since)).toBe(10_000_00 + 60_00 + 100_00 - 970_00 - 500_00)
  })

  it('is the balance itself with nothing recorded since', () => {
    const none: Cents[] = []
    expect(rollForward(c(1234), { contributions: none, loanRepayments: none, loanPayouts: none, withdrawals: none })).toBe(1234)
  })
})

describe('checkCapacity', () => {
  it('refuses when the cash figure is unknown', () => {
    expect(checkCapacity(null, c(100))).toEqual({ ok: false, reason: 'unknown_cash' })
  })

  it('allows a payout up to the capacity', () => {
    expect(checkCapacity(c(1_000_00), c(1_000_00))).toEqual({ ok: true, capacityCents: 1_000_00 })
  })

  it('refuses a payout beyond it, with the shortfall', () => {
    expect(checkCapacity(c(1_000_00), c(1_200_00))).toEqual({ ok: false, reason: 'over_capacity', capacityCents: 1_000_00, shortfallCents: 200_00 })
    // Already short: the shortfall includes the gap below zero.
    expect(checkCapacity(c(-300_00), c(500_00))).toEqual({ ok: false, reason: 'over_capacity', capacityCents: -300_00, shortfallCents: 800_00 })
  })
})
