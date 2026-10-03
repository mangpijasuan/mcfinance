import { describe, expect, it } from 'vitest'
import { cents } from '@/lib/money'
import { COLLECTOR_DEPOSIT_DAYS, collectorCash, isClearingAccount, isPeriod, nextPeriod, periodEnd, reconciliationDifference } from './reconciliation'

const c = (n: number) => cents(n)

describe('periods', () => {
  it('validates, ends and steps months', () => {
    expect(['2026-01', '2026-12'].every(isPeriod)).toBe(true)
    expect(['2026-13', '2026-1', 'x', null, 202601].some(isPeriod)).toBe(false)
    expect(periodEnd('2026-02')).toBe('2026-02-28')
    expect(periodEnd('2028-02')).toBe('2028-02-29')
    expect(periodEnd('2026-12')).toBe('2026-12-31')
    expect(nextPeriod('2026-12')).toBe('2027-01')
    expect(nextPeriod('2026-01')).toBe('2026-02')
  })

  it('knows the clearing accounts', () => {
    expect(['1010', '1020', '1030'].every(isClearingAccount)).toBe(true)
    expect(['1000', '2000', 1010, undefined].some(isClearingAccount)).toBe(false)
  })
})

describe('reconciliationDifference', () => {
  it('adjusts the statement for timing and compares it with the ledger', () => {
    const items = [
      { kind: 'deposit_in_transit' as const, description: 'deposit 31 Oct, credited 2 Nov', cents: c(400_00) },
      { kind: 'outstanding_payment' as const, description: 'withdrawal cheque 1042', cents: c(250_00) },
    ]
    // 10,000 + 400 − 250 = 10,150
    expect(reconciliationDifference(c(10_000_00), items, c(10_150_00))).toBe(0)
    expect(reconciliationDifference(c(10_000_00), items, c(10_200_00))).toBe(-50_00)
    expect(reconciliationDifference(c(10_000_00), [], c(10_000_00))).toBe(0)
  })
})

describe('collectorCash', () => {
  const receipts = [
    { date: '2026-09-10', cents: c(20_00) },
    { date: '2026-09-01', cents: c(40_00) },
    { date: '2026-09-20', cents: c(30_00) },
  ]

  it('uses deposits on the oldest cash first and ages what is left', () => {
    expect(collectorCash('Pat', receipts, c(40_00), '2026-09-21')).toEqual({
      collector: 'Pat', receivedCents: 90_00, depositedCents: 40_00, heldCents: 50_00,
      oldestHeld: '2026-09-10', ageDays: 11, overdue: true,
    })
    // A deposit part-way into a receipt: that receipt is still the oldest held.
    expect(collectorCash('Pat', receipts, c(50_00), '2026-09-21')).toMatchObject({ heldCents: 40_00, oldestHeld: '2026-09-10' })
  })

  it('is not overdue within the deposit window, and holds nothing once all is deposited', () => {
    expect(collectorCash('Pat', receipts, c(60_00), '2026-09-21')).toMatchObject({ oldestHeld: '2026-09-20', ageDays: 1, overdue: false })
    expect(collectorCash('Pat', [{ date: '2026-09-01', cents: c(10_00) }], c(0), `2026-09-${String(1 + COLLECTOR_DEPOSIT_DAYS).padStart(2, '0')}`).overdue).toBe(false)
    expect(collectorCash('Pat', receipts, c(90_00), '2026-09-21')).toMatchObject({ heldCents: 0, oldestHeld: null, ageDays: null, overdue: false })
    expect(collectorCash('Lee', [], c(0), '2026-09-21')).toMatchObject({ receivedCents: 0, heldCents: 0, oldestHeld: null })
  })
})
