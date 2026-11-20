import { describe, expect, it } from 'vitest'
import { advanceSimulation, calculateEarnReward, createSimulation, EARN_RESERVE, simulateClaim, simulateDeposit, simulateLock, simulateTransfer } from './earnSimulator'

describe('MCC Earn simulation', () => {
  it('calculates every approved simple APR and rounds down exactly', () => {
    expect([3, 6, 12, 24, 36].map(m => calculateEarnReward(1_000_000, m))).toEqual([5000, 15000, 50000, 200000, 450000])
    expect(calculateEarnReward(201, 3)).toBe(1)
    expect(() => calculateEarnReward(1_000_000, 48)).toThrow()
    expect(() => calculateEarnReward(0, 36)).toThrow()
    expect(() => calculateEarnReward(1.5, 36)).toThrow()
  })

  it('credits only mock DEX receipts and refuses duplicates across wallets', () => {
    let s = simulateDeposit(createSimulation(), 'A', 'membership-1', 1_000_000, 'membership')
    s = simulateDeposit(s, 'A', 'unknown-1', 1_000_000, 'unverified')
    expect(s.wallets.A).toEqual({ available: 2_000_000, eligible: 0 })
    expect(() => simulateLock(s, 'A', 1_000_000, 36)).toThrow(/eligibility/)
    s = simulateDeposit(s, 'A', 'dex-1', 1_000_000, 'dex')
    expect(() => simulateDeposit(s, 'B', ' DEX-1 ', 1_000_000, 'dex')).toThrow(/already/)
    expect(() => simulateLock(s, 'B', 1_000_000, 36)).toThrow(/eligibility/)
    expect(s.wallets.A.eligible).toBe(1_000_000)
  })

  it('invalidates outgoing eligibility and never restores it through transfers', () => {
    let s = simulateDeposit(createSimulation(), 'A', 'buy', 1000, 'dex')
    s = simulateTransfer(s, 'A', 600)
    expect(s.wallets).toEqual({ A: { available: 400, eligible: 400 }, B: { available: 600, eligible: 0 } })
    s = simulateTransfer(s, 'B', 600)
    expect(s.wallets.A).toEqual({ available: 1000, eligible: 400 })
    expect(() => simulateLock(s, 'A', 1000, 36)).toThrow(/eligibility/)
    expect(() => simulateTransfer(s, 'B', 1)).toThrow(/Insufficient/)
  })

  it('reserves full rewards, prevents oversubscription, and releases principal only at maturity', () => {
    let s = simulateDeposit(createSimulation('2026-01-31'), 'A', 'big', 5_000_000_000, 'dex')
    expect(() => simulateLock(s, 'A', 5_000_000_000, 36)).toThrow(/reserve/)
    expect(s.reserved).toBe(0)
    s = simulateLock(s, 'A', 4_000_000_000, 36)
    expect(s.reserved).toBe(1_800_000_000)
    expect(() => simulateLock(s, 'A', 1_000_000_000, 36)).toThrow(/reserve/)
    expect(() => simulateClaim(s, 'A', 1)).toThrow(/matured/)
    expect(() => simulateClaim(s, 'B', 1)).toThrow(/wallet/)
    s = advanceSimulation(s, 1096)
    expect(s.date).toBe('2029-01-31')
    s = simulateClaim(s, 'A', 1)
    expect(s.reserved).toBe(0)
    expect(s.paid).toBe(1_800_000_000)
    expect(s.wallets.A).toEqual({ available: 6_800_000_000, eligible: 1_000_000_000 })
    expect(s.reserve - s.reserved - s.paid).toBe(EARN_RESERVE - 1_800_000_000)
    expect(() => simulateClaim(s, 'A', 1)).toThrow(/unclaimed/)
    expect(() => simulateLock(s, 'A', 1_000_000_000, 36)).toThrow(/reserve/)
  })

  it('clamps month-end maturity and conserves simulated balances', () => {
    let s = simulateDeposit(createSimulation('2026-01-31'), 'A', 'buy', 1000, 'dex')
    s = simulateLock(s, 'A', 1000, 3)
    expect(s.locks[0].matures).toBe('2026-04-30')
    expect(s.wallets.A.available + s.locks[0].principal).toBe(s.deposited)
    expect(() => simulateLock(s, 'A', 1000, 3)).toThrow(/eligibility/)
    s = advanceSimulation(s, 88)
    expect(() => simulateClaim(s, 'A', 1)).toThrow(/matured/)
    s = simulateClaim(advanceSimulation(s, 1), 'A', 1)
    expect(s.wallets.A.available).toBe(s.deposited + s.paid)
    expect(s.wallets.A.eligible).toBe(0)
    expect(() => advanceSimulation(s, -1)).toThrow()
    expect(() => simulateDeposit(s, 'B', 'too-much', 98_000_000_000, 'dex')).toThrow(/supply/)
  })

  it('rejects locks beyond the simulated calendar horizon', () => {
    const s = simulateDeposit(createSimulation('2099-12-31'), 'A', 'last', 1000, 'dex')
    expect(() => simulateLock(s, 'A', 1000, 3)).toThrow(/date limit/)
    expect(() => advanceSimulation(s, 1)).toThrow(/date limit/)
  })
})
