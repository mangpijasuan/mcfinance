// The card fee (docs/operations/card-fee.md): a percentage added to card and
// Apple Pay payments only. Bank and Zelle payments never carry it. The fee
// is collected on top of what the member means to pay; it is never part of
// a contribution or a loan repayment.

/** The card networks' ceiling on a surcharge. */
export const MAX_CARD_FEE_PERCENT = 3

/** `CARD_FEE_PERCENT` ("3", "2.5"): off when empty, 0 or not a number; never above the networks' 3%. */
export function cardFeePercent(raw: string | undefined = process.env.CARD_FEE_PERCENT): number {
  const n = Number(raw?.trim())
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, MAX_CARD_FEE_PERCENT)
}

/** The fee in cents on a payment of `amountCents`, rounded to the nearest cent. */
export function cardFeeCents(amountCents: number, percent: number): number {
  if (!(percent > 0) || !(amountCents > 0)) return 0
  return Math.round((amountCents * percent) / 100)
}
