import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { cents, parseDollars, sum } from '@/lib/money'
import {
  DuesError, addPeriods, agingBucket, coveredThrough, duesStatus, isPeriod, laterPeriod, periodLabel, periodOf,
  periodRangeLabel, periodsBetween, planAmountFor, type Obligation,
} from './dues'

const $ = (s: string) => parseDollars(s)
const monthly = (from: string, to: string, amount = '20'): Obligation[] => periodsBetween(from, to).map((period) => ({ period, amount: $(amount) }))
const pay = (...amounts: string[]) => amounts.map((a, i) => ({ id: `P${i + 1}`, amount: $(a) }))

describe('periods', () => {
  it('parses, steps and labels calendar months', () => {
    expect(isPeriod('2026-01')).toBe(true)
    expect(isPeriod('2026-13')).toBe(false)
    expect(isPeriod(202601)).toBe(false)
    expect(periodOf('2026-03-10')).toBe('2026-03')
    expect(addPeriods('2026-11', 3)).toBe('2027-02')
    expect(addPeriods('2026-01', -1)).toBe('2025-12')
    expect(periodsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(periodsBetween('2026-05', '2026-04')).toEqual([])
    expect(periodLabel('2026-09')).toBe('Sep 2026')
    expect(laterPeriod('2026-01', '2025-06')).toBe('2026-01')
    expect(laterPeriod('2025-06', '2026-01')).toBe('2026-01')
  })

  it('refuses anything that is not a month', () => {
    expect(() => periodOf('March')).toThrow(DuesError)
    expect(() => addPeriods('2026-00', 1)).toThrow(DuesError)
  })

  it('labels ranges compactly', () => {
    expect(periodRangeLabel([])).toBe('')
    expect(periodRangeLabel(['2026-01'])).toBe('Jan 2026')
    expect(periodRangeLabel(['2026-01', '2026-02', '2026-03'])).toBe('Jan – Mar 2026')
    expect(periodRangeLabel(['2026-12', '2027-01'])).toBe('Dec 2026 – Jan 2027')
  })

  it('buckets arrears by months behind', () => {
    expect([0, 1, 2, 3, 4, 12].map(agingBucket)).toEqual([null, '1 month', '2–3 months', '2–3 months', '4+ months', '4+ months'])
  })
})

describe('plans', () => {
  const plans = [{ startPeriod: '2026-01', amount: $('20') }, { startPeriod: '2026-07', amount: $('25') }]
  it('uses the latest plan that has started', () => {
    expect(planAmountFor(plans, '2025-12')).toBeNull()
    expect(planAmountFor(plans, '2026-06')).toBe($('20'))
    expect(planAmountFor([...plans].reverse(), '2026-09')).toBe($('25'))
  })
})

describe('duesStatus', () => {
  it('pays the oldest month first and holds the rest as credit', () => {
    const s = duesStatus({ obligations: monthly('2026-01', '2026-03'), payments: pay('50', '30'), currentPeriod: '2026-03' })
    expect(s.allocations.get('P1')).toEqual([
      { period: '2026-01', amount: $('20') }, { period: '2026-02', amount: $('20') }, { period: '2026-03', amount: $('10') },
    ])
    expect(s.allocations.get('P2')).toEqual([{ period: '2026-03', amount: $('10') }])
    expect(s).toMatchObject({ credit: $('20'), totalDue: $('60'), totalPaid: $('80'), arrears: 0, paidThrough: '2026-03', currentPaid: true })
  })

  it('shows what is overdue, part paid, due and upcoming', () => {
    const s = duesStatus({ obligations: monthly('2026-01', '2026-05'), payments: pay('30'), currentPeriod: '2026-03' })
    expect(s.obligations.map((o) => o.status)).toEqual(['paid', 'overdue', 'due', 'upcoming', 'upcoming'])
    expect(s).toMatchObject({ arrears: $('10'), overduePeriods: ['2026-02'], paidThrough: '2026-01', currentPaid: false, credit: 0 })
    const partly = duesStatus({ obligations: monthly('2026-03', '2026-03'), payments: pay('5'), currentPeriod: '2026-03' })
    expect(partly.obligations[0]).toMatchObject({ status: 'partly_paid', paid: $('5'), remaining: $('15') })
  })

  it('handles no obligations and no payments', () => {
    expect(duesStatus({ obligations: [], payments: pay('20'), currentPeriod: '2026-03' }))
      .toMatchObject({ credit: $('20'), paidThrough: null, currentPaid: null, arrears: 0 })
    expect(duesStatus({ obligations: monthly('2026-01', '2026-02'), payments: [], currentPeriod: '2026-03' }))
      .toMatchObject({ paidThrough: null, currentPaid: null, overduePeriods: ['2026-01', '2026-02'] })
  })

  it('sorts obligations and refuses bad input', () => {
    const s = duesStatus({ obligations: [...monthly('2026-01', '2026-02')].reverse(), payments: pay('20'), currentPeriod: '2026-02' })
    expect(s.obligations[0]).toMatchObject({ period: '2026-01', status: 'paid' })
    expect(() => duesStatus({ obligations: [...monthly('2026-01', '2026-01'), ...monthly('2026-01', '2026-01')], payments: [], currentPeriod: '2026-01' })).toThrow(/two obligations/)
    expect(() => duesStatus({ obligations: [{ period: '2026-01', amount: cents(0) }], payments: [], currentPeriod: '2026-01' })).toThrow(DuesError)
    expect(() => duesStatus({ obligations: [], payments: [{ id: 'x', amount: cents(-1) }], currentPeriod: '2026-01' })).toThrow(DuesError)
    expect(() => duesStatus({ obligations: [{ period: '2026-1', amount: $('20') }], payments: [], currentPeriod: '2026-01' })).toThrow(DuesError)
  })

  it('months covered depend only on the total, never on payment order (property)', () => {
    const arb = fc.array(fc.integer({ min: 1, max: 10_000 }), { maxLength: 12 })
    fc.assert(fc.property(arb, fc.integer({ min: 1, max: 24 }), (amounts, months) => {
      const obligations = monthly('2026-01', addPeriods('2026-01', months - 1), '20')
      const payments = amounts.map((a, i) => ({ id: `P${i}`, amount: cents(a) }))
      const a = duesStatus({ obligations, payments, currentPeriod: '2026-06' })
      const b = duesStatus({ obligations, payments: [...payments].reverse(), currentPeriod: '2026-06' })
      const allocated = sum(Array.from(a.allocations.values()).flat().map((x) => x.amount))
      return JSON.stringify(a.obligations) === JSON.stringify(b.obligations)
        && a.credit === b.credit
        && allocated + a.credit === sum(payments.map((p) => p.amount))
    }), { numRuns: 300 })
  })
})

describe('coveredThrough', () => {
  const plans = [{ startPeriod: '2026-01', amount: $('20') }]

  it('extends past the last obligation by whole months of credit', () => {
    const s = duesStatus({ obligations: monthly('2026-01', '2026-03'), payments: pay('110'), currentPeriod: '2026-03' })
    expect(coveredThrough(s, plans)).toBe('2026-05') // $50 credit = two more months, $10 left over
  })

  it('stops at an unpaid month, a $0 plan, or no obligations', () => {
    const behind = duesStatus({ obligations: monthly('2026-01', '2026-03'), payments: pay('20'), currentPeriod: '2026-03' })
    expect(coveredThrough(behind, plans)).toBe('2026-01')
    const exempt = duesStatus({ obligations: monthly('2026-01', '2026-01'), payments: pay('100'), currentPeriod: '2026-01' })
    expect(coveredThrough(exempt, [...plans, { startPeriod: '2026-03', amount: cents(0) }])).toBe('2026-02')
    expect(coveredThrough(duesStatus({ obligations: [], payments: pay('20'), currentPeriod: '2026-01' }), plans)).toBeNull()
  })
})
