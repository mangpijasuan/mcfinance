import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MoneyError, cents, parseDollars, sum } from '@/lib/money'
import {
  LoanEngineError, POLICY_VERSION, applyPayment, buildSchedule, chargeFee, daysBetween, delinquency, lateFeesDue,
  openPosition, outstandingPrincipal, payoffAmount, replay, waiveFee, type ExcessRule, type LoanEvent,
} from '.'

const $ = (s: string) => parseDollars(s)
const schedule = (principal: string, n: number, loanDate = '2026-01-15') =>
  buildSchedule({ principal: $(principal), installments: n, loanDate })

describe('buildSchedule', () => {
  it('matches the golden table in the architecture docs', () => {
    const a = schedule('10000', 24)
    expect(a.installments.slice(0, 23).every((i) => i.total === $('416.66'))).toBe(true)
    expect(a.installments[23].total).toBe($('416.82'))
    expect(sum(a.installments.map((i) => i.total))).toBe($('10000'))
    expect(schedule('5070', 24).installments.every((i) => i.total === $('211.25'))).toBe(true)
    expect(schedule('1530', 12).installments.every((i) => i.total === $('127.50'))).toBe(true)
    expect(a.policyVersion).toBe(POLICY_VERSION)
    expect(a.totalRepayable).toBe($('10000'))
  })

  it('sums exactly for every principal from $1 to $5,000 and terms 6/12/18/24', () => {
    for (const term of [6, 12, 18, 24]) {
      for (let dollars = 1; dollars <= 5000; dollars++) {
        const s = buildSchedule({ principal: cents(dollars * 100), installments: term, loanDate: '2026-01-15' })
        const parts = s.installments.map((i) => i.principal)
        if (sum(parts) !== dollars * 100) throw new Error(`$${dollars}/${term} does not sum`)
        // every installment but the last is equal; the last absorbs the remainder
        if (parts.slice(0, -1).some((p) => p !== parts[0]) || parts[term - 1] < parts[0]) throw new Error(`$${dollars}/${term} shape`)
      }
    }
  })

  it('falls due on the 10th of each following month, across year ends', () => {
    const s = buildSchedule({ principal: $('600'), installments: 3, loanDate: '2026-11-28' })
    expect(s.installments.map((i) => i.dueDate)).toEqual(['2026-12-10', '2027-01-10', '2027-02-10'])
    expect(buildSchedule({ principal: $('100'), installments: 1, loanDate: '2026-01-31', dueDay: 28 }).installments[0].dueDate).toBe('2026-02-28')
  })

  it('refuses interest, bad terms, bad days and bad dates', () => {
    const base = { principal: $('1000'), installments: 10, loanDate: '2026-01-15' }
    expect(() => buildSchedule({ ...base, interestRateBps: 500 })).toThrow(/interest is not enabled/)
    expect(() => buildSchedule({ ...base, principal: cents(0) })).toThrow(LoanEngineError)
    expect(() => buildSchedule({ ...base, installments: 0 })).toThrow(LoanEngineError)
    expect(() => buildSchedule({ ...base, installments: 361 })).toThrow(LoanEngineError)
    expect(() => buildSchedule({ ...base, dueDay: 31 })).toThrow(LoanEngineError)
    expect(() => buildSchedule({ ...base, loanDate: '2026-02-30' })).toThrow(/not a real date/)
    expect(() => buildSchedule({ ...base, loanDate: '15/01/2026' })).toThrow(/not an ISO date/)
  })
})

describe('applyPayment', () => {
  const s = schedule('1000', 10) // $100 due on the 10th, Feb–Nov 2026

  it('pays the current installment on time', () => {
    const r = applyPayment(openPosition(s), $('100'), '2026-02-05')
    expect(r.allocations).toEqual([{ kind: 'current', installment: 1, amount: $('100') }])
    expect(outstandingPrincipal(r.position)).toBe($('900'))
    expect(r.unapplied).toBe(0)
  })

  it('pays fees first, then the oldest overdue installments, then the current one', () => {
    const late = chargeFee(openPosition(s), $('5'))
    const r = applyPayment(late, $('255'), '2026-04-01') // Feb and Mar overdue; Apr current
    expect(r.allocations).toEqual([
      { kind: 'fee', amount: $('5') },
      { kind: 'overdue', installment: 1, amount: $('100') },
      { kind: 'overdue', installment: 2, amount: $('100') },
      { kind: 'current', installment: 3, amount: $('50') },
    ])
    expect(r.position.feesOutstanding).toBe(0)
  })

  it('a partial payment spans installments without paying any twice', () => {
    let p = openPosition(s)
    p = applyPayment(p, $('60'), '2026-02-01').position
    p = applyPayment(p, $('60'), '2026-02-02').position
    expect(p.paid.slice(0, 2)).toEqual([$('100'), $('20')])
  })

  it('prepays the next installments by default', () => {
    const r = applyPayment(openPosition(s), $('250'), '2026-02-01')
    expect(r.allocations.map((a) => [a.kind, a.installment])).toEqual([['current', 1], ['prepay', 2], ['prepay', 3]])
    expect(delinquency(r.position, '2026-04-20').status).toBe('current') // ahead of schedule
  })

  it('can instead shorten the term from the end', () => {
    const r = applyPayment(openPosition(s), $('250'), '2026-02-01', 'reduce_term')
    expect(r.allocations.map((a) => [a.kind, a.installment])).toEqual([['current', 1], ['prepay', 10], ['prepay', 9]])
  })

  it('pays off early, mid-period, and holds any overpayment as unapplied', () => {
    let p = applyPayment(openPosition(s), $('130'), '2026-02-01').position
    expect(payoffAmount(p)).toBe($('870'))
    const r = applyPayment(p, $('900'), '2026-03-20')
    expect(outstandingPrincipal(r.position)).toBe(0)
    expect(r.unapplied).toBe($('30'))
    expect(delinquency(r.position, '2027-01-01').status).toBe('paid_off')
    p = r.position
    expect(applyPayment(p, $('1'), '2027-01-01').unapplied).toBe($('1'))
  })

  it('pays off exactly on every installment boundary', () => {
    for (let k = 0; k < 10; k++) {
      let p = openPosition(s)
      for (let i = 0; i < k; i++) p = applyPayment(p, $('100'), s.installments[i].dueDate).position
      const r = applyPayment(p, payoffAmount(p), s.installments[k].dueDate)
      expect(outstandingPrincipal(r.position)).toBe(0)
      expect(r.unapplied).toBe(0)
    }
  })

  it('rejects bad input', () => {
    const p = openPosition(s)
    expect(() => applyPayment(p, cents(0), '2026-02-01')).toThrow(MoneyError)
    expect(() => applyPayment(p, $('1'), 'yesterday')).toThrow(LoanEngineError)
    expect(() => applyPayment({ ...p, paid: [] }, $('1'), '2026-02-01')).toThrow(/does not match/)
    expect(() => applyPayment({ ...p, paid: p.paid.map(() => $('200')) }, $('1'), '2026-02-01')).toThrow(/out of range/)
    expect(() => applyPayment({ ...p, feesOutstanding: cents(-1) }, $('1'), '2026-02-01')).toThrow(/feesOutstanding/)
    expect(() => chargeFee(p, cents(0))).toThrow(MoneyError)
  })

  it('never loses or invents a cent, and principal never goes negative (property)', () => {
    const arbSchedule = fc.record({
      dollars: fc.integer({ min: 1, max: 5000 }),
      term: fc.constantFrom(6, 10, 12, 18, 24),
    }).map(({ dollars, term }) => buildSchedule({ principal: cents(dollars * 100), installments: term, loanDate: '2026-01-15' }))
    const arbEvents = fc.array(fc.oneof(
      fc.record({
        type: fc.constant('payment' as const),
        amount: fc.integer({ min: 1, max: 300_000 }).map(cents),
        asOf: fc.integer({ min: 0, max: 900 }).map((d) => new Date(Date.UTC(2026, 0, 15 + d)).toISOString().slice(0, 10)),
        excess: fc.constantFrom<ExcessRule>('prepay_next', 'reduce_term'),
      }),
      fc.record({ type: fc.constant('fee' as const), amount: fc.constant(cents(500)) }),
    ), { maxLength: 30 })

    fc.assert(fc.property(arbSchedule, arbEvents, (sch, events) => {
      let p = openPosition(sch)
      let feesCharged = 0
      let paidIn = 0
      let unapplied = 0
      for (const e of events as LoanEvent[]) {
        if (e.type === 'fee') { p = chargeFee(p, e.amount); feesCharged += e.amount; continue }
        if (e.type !== 'payment') continue
        const r = applyPayment(p, e.amount, e.asOf, e.excess)
        if (sum(r.allocations.map((a) => a.amount)) + r.unapplied !== e.amount) return false
        if (r.allocations.some((a) => a.amount <= 0)) return false
        p = r.position
        paidIn += e.amount
        unapplied += r.unapplied
      }
      const principalPaid = sum(p.paid)
      const feesPaid = feesCharged - p.feesOutstanding
      return outstandingPrincipal(p) >= 0
        && p.paid.every((x, i) => x >= 0 && x <= sch.installments[i].principal)
        && principalPaid + feesPaid + unapplied === paidIn
    }), { numRuns: 500 })
  })
})

describe('replay and reversal', () => {
  it('reversing a payment restores the exact prior state', () => {
    const s = schedule('2400', 12)
    const before: LoanEvent[] = [
      { type: 'payment', amount: $('200'), asOf: '2026-02-09' },
      { type: 'fee', amount: $('5') },
      { type: 'payment', amount: $('150'), asOf: '2026-04-01' },
    ]
    const withMistake = [...before, { type: 'payment' as const, amount: $('999'), asOf: '2026-05-01', excess: 'reduce_term' as const }]
    expect(replay(s, withMistake).position).not.toEqual(replay(s, before).position)
    expect(replay(s, withMistake.slice(0, -1))).toEqual(replay(s, before))
    expect(replay(s, before).allocations).toHaveLength(3)
  })

  it('a waived fee leaves the position as if it had never been charged', () => {
    const s = schedule('1000', 10)
    const pay: LoanEvent = { type: 'payment', amount: $('100'), asOf: '2026-03-01' }
    const waived = replay(s, [{ type: 'fee', amount: $('5') }, { type: 'fee_waiver', amount: $('5') }, pay])
    expect(waived.position).toEqual(replay(s, [pay]).position)
    expect(waived.allocations).toEqual([[], [], replay(s, [pay]).allocations[0]])
  })
})

describe('waiveFee', () => {
  const p = chargeFee(openPosition(schedule('1000', 10)), $('5'))

  it('reduces unpaid fees', () => {
    expect(waiveFee(p, $('5')).feesOutstanding).toBe(0)
    expect(payoffAmount(waiveFee(p, $('2')))).toBe($('1003'))
  })

  it('refuses a fee that is not unpaid, or a non-positive amount', () => {
    expect(() => waiveFee(p, $('6'))).toThrow(LoanEngineError)
    expect(() => waiveFee(p, cents(0))).toThrow(MoneyError)
    expect(() => waiveFee(p, 1.5 as never)).toThrow(MoneyError)
  })
})

describe('delinquency and late fees', () => {
  const s = schedule('1000', 10)
  const p = openPosition(s)

  it('counts days past due from the oldest unpaid installment', () => {
    expect(delinquency(p, '2026-02-10')).toMatchObject({ status: 'current', daysPastDue: 0, overdueInstallments: [] })
    expect(delinquency(p, '2026-02-25')).toMatchObject({ status: 'current', daysPastDue: 15, overdueInstallments: [1] })
    expect(delinquency(p, '2026-02-26')).toMatchObject({ status: 'delinquent', daysPastDue: 16 })
    expect(delinquency(p, '2026-03-11')).toMatchObject({ overdueInstallments: [1, 2], overdueAmount: $('200') })
  })

  it('becomes current again once arrears are cleared', () => {
    const paid = applyPayment(p, $('200'), '2026-03-15').position
    expect(delinquency(paid, '2026-03-15')).toMatchObject({ status: 'current', daysPastDue: 0 })
  })

  it('a late fee is due once per installment, only after the grace period', () => {
    expect(lateFeesDue(p, '2026-02-25', { alreadyCharged: [] })).toEqual([])
    expect(lateFeesDue(p, '2026-02-26', { alreadyCharged: [] })).toEqual([1])
    expect(lateFeesDue(p, '2026-03-30', { alreadyCharged: [1] })).toEqual([2])
    const settled = applyPayment(p, $('200'), '2026-03-30').position
    expect(lateFeesDue(settled, '2026-03-30', { alreadyCharged: [1] })).toEqual([])
    expect(lateFeesDue(p, '2026-02-15', { alreadyCharged: [], graceDays: 3 })).toEqual([1])
  })

  it('never charges an installment twice however often the job runs (property)', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 400 }), { maxLength: 40 }), (offsets) => {
      const charged: number[] = []
      for (const d of [...offsets].sort((a, b) => a - b)) {
        const asOf = new Date(Date.UTC(2026, 1, 1 + d)).toISOString().slice(0, 10)
        charged.push(...lateFeesDue(p, asOf, { alreadyCharged: charged }))
      }
      return new Set(charged).size === charged.length
    }))
  })

  it('computes whole days between dates across month ends', () => {
    expect(daysBetween('2026-02-10', '2026-03-10')).toBe(28)
    expect(daysBetween('2026-03-10', '2026-02-10')).toBe(-28)
  })
})

