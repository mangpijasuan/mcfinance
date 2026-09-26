// Money as integer cents (D-03). Every monetary amount in new code is a
// `Cents` value: a safe integer number of US cents. No floating-point
// arithmetic touches money here; parsing works on the decimal string.
//
// Why `number` and not `bigint`: every amount the club will ever handle is
// far below Number.MAX_SAFE_INTEGER cents (~$90 trillion), plain numbers
// work with JSON and React, and every operation below checks it stays a
// safe integer. The database stores cents as BIGINT; convert at the edge
// with toBigInt / fromBigInt.

declare const brand: unique symbol
export type Cents = number & { readonly [brand]: 'Cents' }

export const CURRENCY = 'USD'

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

function assertSafe(value: number, what = 'amount'): void {
  if (!Number.isSafeInteger(value)) throw new MoneyError(`${what} must be a whole number of cents, got ${value}`)
}

/** Wrap a whole number of cents. */
export function cents(value: number): Cents {
  assertSafe(value)
  return value as Cents
}

export const ZERO = cents(0)

/**
 * Parse a dollar amount written in decimal: "12", "12.3", "12.34",
 * "1,234.50", "-5.00", "$7.25". At most two decimal places, no rounding:
 * "12.345" is an error, not $12.35. Numbers are accepted only when they
 * convert exactly (see fromLegacyDollars for stored floats).
 */
export function parseDollars(input: string | number): Cents {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new MoneyError(`not a valid amount: ${input}`)
    return parseDollars(String(input))
  }
  const text = input.trim().replace(/^\$/, '').replace(/,/g, '')
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text.replace(/^-\$/, '-'))
  if (!m) throw new MoneyError(`not a valid dollar amount: "${input}"`)
  const [, sign, whole, frac = ''] = m
  const value = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  assertSafe(value)
  return cents(sign && value !== 0 ? -value : value)
}

/**
 * Convert a dollar amount stored as a float by the legacy schema. Values
 * that are not within a millionth of a cent of a whole cent are refused
 * rather than silently rounded.
 */
export function fromLegacyDollars(value: number): Cents {
  if (!Number.isFinite(value)) throw new MoneyError(`not a valid amount: ${value}`)
  const scaled = value * 100
  const rounded = Math.round(scaled)
  if (Math.abs(scaled - rounded) > 1e-6) throw new MoneyError(`${value} is not a whole number of cents`)
  return cents(rounded === 0 ? 0 : rounded) // normalise -0
}

/** For legacy Float columns only (dual-write). New code stores cents. */
export function toLegacyDollars(amount: Cents): number {
  return amount / 100
}

export function toBigInt(amount: Cents): bigint {
  return BigInt(amount)
}

export function fromBigInt(value: bigint): Cents {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError(`${value} cents is outside the safe range`)
  }
  return cents(Number(value))
}

export function add(...amounts: Cents[]): Cents {
  let total = 0
  for (const a of amounts) {
    total += a
    assertSafe(total, 'total')
  }
  return total as Cents
}

export function sum(amounts: readonly Cents[]): Cents {
  return add(...amounts)
}

export function subtract(a: Cents, b: Cents): Cents {
  const result = a - b
  assertSafe(result, 'difference')
  return result as Cents
}

export function negate(a: Cents): Cents {
  return (a === 0 ? 0 : -a) as Cents
}

export function min(a: Cents, b: Cents): Cents {
  return (a <= b ? a : b) as Cents
}

export function max(a: Cents, b: Cents): Cents {
  return (a >= b ? a : b) as Cents
}

export const isZero = (a: Cents) => a === 0
export const isPositive = (a: Cents) => a > 0
export const isNegative = (a: Cents) => a < 0

/** Multiply by a whole number (e.g. installments × amount). */
export function times(a: Cents, factor: number): Cents {
  if (!Number.isSafeInteger(factor)) throw new MoneyError(`factor must be a whole number, got ${factor}`)
  const result = a * factor
  assertSafe(result, 'product')
  return result as Cents
}

/**
 * Split `total` into `parts` whole-cent amounts that add up exactly to it.
 * Every part gets the floor share; the remainder goes to the last part
 * (the loan-schedule rule, D-08) or is spread one cent at a time from the
 * first part.
 */
export function splitEvenly(total: Cents, parts: number, remainder: 'last' | 'spread' = 'last'): Cents[] {
  if (!Number.isSafeInteger(parts) || parts < 1) throw new MoneyError(`parts must be a positive whole number, got ${parts}`)
  if (total < 0) return splitEvenly(negate(total), parts, remainder).map(negate)
  const base = Math.floor(total / parts)
  const left = total - base * parts
  const out = Array.from({ length: parts }, () => base)
  if (remainder === 'last') out[parts - 1] += left
  else for (let i = 0; i < left; i++) out[i] += 1
  return out as Cents[]
}

/**
 * Split `total` by ratios (largest-remainder method), exactly: the parts
 * always add up to `total`. Ratios must be non-negative and not all zero.
 */
export function allocate(total: Cents, ratios: readonly number[]): Cents[] {
  if (ratios.length === 0) throw new MoneyError('allocate needs at least one ratio')
  if (ratios.some((r) => !Number.isFinite(r) || r < 0)) throw new MoneyError('ratios must be non-negative numbers')
  const weight = ratios.reduce((a, b) => a + b, 0)
  if (weight === 0) throw new MoneyError('ratios must not all be zero')
  if (total < 0) return allocate(negate(total), ratios).map(negate)
  const exact = ratios.map((r) => (total * r) / weight)
  const floors = exact.map(Math.floor)
  let left = total - floors.reduce((a, b) => a + b, 0)
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left === 0) break
    floors[i] += 1
    left -= 1
  }
  return floors as Cents[]
}

/** "1234.50" — plain decimal string, for CSV exports and inputs. */
export function toDecimalString(amount: Cents): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** "$1,234.50" / "-$5.00" — for display. */
export function formatUSD(amount: Cents): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  const dollars = Math.floor(abs / 100).toLocaleString('en-US')
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`
}
