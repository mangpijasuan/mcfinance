import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MoneyError, ZERO, add, allocate, cents, formatUSD, fromBigInt, fromLegacyDollars, isNegative, isPositive, isZero,
  max, min, negate, parseDollars, splitEvenly, subtract, sum, times, toBigInt, toDecimalString, toLegacyDollars, type Cents,
} from '.'

const c = (n: number) => cents(n)
const anyCents = fc.integer({ min: -10_000_000_00, max: 10_000_000_00 }).map(c)

describe('construction', () => {
  it('accepts only safe whole cents', () => {
    expect(cents(0)).toBe(0)
    expect(() => cents(1.5)).toThrow(MoneyError)
    expect(() => cents(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError)
    expect(() => cents(Number.NaN)).toThrow(MoneyError)
  })
})

describe('parseDollars', () => {
  it.each([
    ['12', 1200], ['12.3', 1230], ['12.34', 1234], ['0.05', 5], [' 1,234.50 ', 123450], ['$7.25', 725],
    ['-5.00', -500], ['-$7.25', -725], ['0', 0], ['-0', 0], ['-0.00', 0],
  ])('"%s" → %d cents', (input, expected) => {
    expect(parseDollars(input)).toBe(expected)
    expect(Object.is(parseDollars(input), -0)).toBe(false)
  })

  it.each(['12.345', '1.2.3', 'abc', '', '12.', '.5', '--1', '1e3', '$', '12,34.5x'])('rejects "%s"', (input) => {
    expect(() => parseDollars(input)).toThrow(MoneyError)
  })

  it('accepts numbers only when exact', () => {
    expect(parseDollars(12.5)).toBe(1250)
    expect(parseDollars(416.67)).toBe(41667)
    expect(() => parseDollars(0.1 + 0.2)).toThrow(MoneyError)
    expect(() => parseDollars(Number.POSITIVE_INFINITY)).toThrow(MoneyError)
    expect(() => parseDollars(1e21)).toThrow(MoneyError)
  })

  it('refuses amounts beyond the safe range', () => {
    expect(() => parseDollars('99999999999999999')).toThrow(MoneyError)
  })

  it('round-trips with toDecimalString', () => {
    fc.assert(fc.property(anyCents, (a) => parseDollars(toDecimalString(a)) === a))
  })
})

describe('legacy floats', () => {
  it('converts stored float dollars exactly or refuses', () => {
    expect(fromLegacyDollars(416.67)).toBe(41667)
    expect(fromLegacyDollars(0.1 + 0.2)).toBe(30)
    expect(fromLegacyDollars(10000.08)).toBe(1000008)
    expect(Object.is(fromLegacyDollars(-0), -0)).toBe(false)
    expect(() => fromLegacyDollars(12.345)).toThrow(MoneyError)
    expect(() => fromLegacyDollars(Number.NaN)).toThrow(MoneyError)
    expect(toLegacyDollars(c(41667))).toBe(416.67)
  })

  it('round-trips every cent value through the legacy float', () => {
    fc.assert(fc.property(anyCents, (a) => fromLegacyDollars(toLegacyDollars(a)) === a))
  })
})

describe('BigInt edge', () => {
  it('converts both ways and guards the range', () => {
    expect(toBigInt(c(123))).toBe(BigInt(123))
    expect(fromBigInt(BigInt(-456))).toBe(-456)
    expect(() => fromBigInt(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1))).toThrow(MoneyError)
    expect(() => fromBigInt(BigInt(Number.MIN_SAFE_INTEGER) - BigInt(1))).toThrow(MoneyError)
  })
})

describe('arithmetic', () => {
  it('adds, subtracts, negates, compares', () => {
    expect(add(c(1), c(2), c(3))).toBe(6)
    expect(add()).toBe(0)
    expect(sum([c(10), c(-4)])).toBe(6)
    expect(subtract(c(5), c(7))).toBe(-2)
    expect(negate(c(5))).toBe(-5)
    expect(Object.is(negate(ZERO), -0)).toBe(false)
    expect(min(c(3), c(2))).toBe(2)
    expect(min(c(2), c(3))).toBe(2)
    expect(max(c(3), c(2))).toBe(3)
    expect(max(c(2), c(3))).toBe(3)
    expect(isZero(ZERO)).toBe(true)
    expect(isPositive(c(1))).toBe(true)
    expect(isNegative(c(-1))).toBe(true)
    expect(times(c(41666), 23)).toBe(958318)
  })

  it('refuses results outside the safe range', () => {
    const big = c(Number.MAX_SAFE_INTEGER)
    expect(() => add(big, c(1))).toThrow(MoneyError)
    expect(() => subtract(c(Number.MIN_SAFE_INTEGER), c(1))).toThrow(MoneyError)
    expect(() => times(big, 2)).toThrow(MoneyError)
    expect(() => times(c(1), 1.5)).toThrow(MoneyError)
  })

  it('addition is exact where floats are not', () => {
    // $0.10 + $0.20 = $0.30 exactly.
    expect(add(parseDollars('0.10'), parseDollars('0.20'))).toBe(parseDollars('0.30'))
  })
})

describe('splitEvenly', () => {
  it('puts the remainder on the last part by default (loan schedule rule)', () => {
    const parts = splitEvenly(parseDollars('10000'), 24)
    expect(parts.slice(0, 23).every((p) => p === 41666)).toBe(true)
    expect(parts[23]).toBe(41682)
    expect(sum(parts)).toBe(1_000_000)
  })

  it('can spread the remainder one cent at a time', () => {
    expect(splitEvenly(c(10), 3, 'spread')).toEqual([4, 3, 3])
  })

  it('handles negatives and rejects bad part counts', () => {
    expect(splitEvenly(c(-10), 3)).toEqual([-3, -3, -4])
    expect(() => splitEvenly(c(10), 0)).toThrow(MoneyError)
    expect(() => splitEvenly(c(10), 1.5)).toThrow(MoneyError)
  })

  it('always sums exactly (property)', () => {
    fc.assert(fc.property(anyCents, fc.integer({ min: 1, max: 360 }), fc.constantFrom('last', 'spread'), (total, n, mode) => {
      const parts = splitEvenly(total, n, mode as 'last' | 'spread')
      return parts.length === n && sum(parts) === total && parts.every(Number.isSafeInteger)
    }))
  })
})

describe('allocate', () => {
  it('splits by ratio exactly', () => {
    expect(allocate(c(100), [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(c(5), [3, 7])).toEqual([2, 3]) // 1.5 / 3.5 → tie broken toward the first
    expect(allocate(c(-100), [1, 3])).toEqual([-25, -75])
    expect(allocate(c(0), [1, 0])).toEqual([0, 0])
  })

  it('rejects bad ratios', () => {
    expect(() => allocate(c(1), [])).toThrow(MoneyError)
    expect(() => allocate(c(1), [0, 0])).toThrow(MoneyError)
    expect(() => allocate(c(1), [-1, 2])).toThrow(MoneyError)
    expect(() => allocate(c(1), [Number.NaN])).toThrow(MoneyError)
  })

  it('always sums exactly and stays within one cent of the exact share (property)', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 100_000_000 }).map(c),
      fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 }).filter((r) => r.some((x) => x > 0)),
      (total, ratios) => {
        const parts = allocate(total, ratios)
        const weight = ratios.reduce((a, b) => a + b, 0)
        return sum(parts) === total && parts.every((p, i) => Math.abs(p - (total * ratios[i]) / weight) < 1)
      },
    ))
  })
})

describe('formatting', () => {
  it.each([[0, '$0.00'], [5, '$0.05'], [123456789, '$1,234,567.89'], [-500, '-$5.00']] as [number, string][])('%d → %s', (v, s) => {
    expect(formatUSD(c(v) as Cents)).toBe(s)
  })

  it('writes plain decimals', () => {
    expect(toDecimalString(c(-5))).toBe('-0.05')
    expect(toDecimalString(c(123450))).toBe('1234.50')
  })
})
