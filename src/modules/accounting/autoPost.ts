// Shared rules for entries the system posts on its own (loan and
// contribution events). They wait until every account they use has been
// approved (the chart of accounts is "proposed" until the accountant signs
// it off, Gate #1 A13); the caller records the event either way and posts
// the backlog on a later run. Idempotency keys make repeats harmless.
import type { Prisma } from '@prisma/client'
import { type EntryInput, postEntry } from './ledger'

type Tx = Prisma.TransactionClient

export const CASH_ACCOUNTS = {
  bank: '1000',
  stripeClearing: '1010',
  transferClearing: '1020',
  collectorCash: '1030',
} as const

/**
 * Where money received arrives, by payment method. A proposal for the
 * accountant (A13): card payments wait in Stripe clearing, transfers in
 * transfer clearing, cash with the collector until deposited.
 */
export function receiptAccount(method: string | null | undefined): string {
  const m = (method ?? '').toLowerCase()
  if (m.includes('stripe') || m.includes('card') || m === 'online') return CASH_ACCOUNTS.stripeClearing
  if (m.includes('zelle') || m.includes('venmo') || m.includes('transfer')) return CASH_ACCOUNTS.transferClearing
  if (m === 'cash') return CASH_ACCOUNTS.collectorCash
  return CASH_ACCOUNTS.bank
}

/** Whether every one of these accounts is approved for posting. */
export async function accountsReady(tx: Tx, codes: readonly string[]): Promise<boolean> {
  const waiting = await tx.ledgerAccount.count({ where: { code: { in: Array.from(new Set(codes)) }, status: 'proposed' } })
  return waiting === 0
}

/** Post the entry if every account it uses is approved; otherwise null (post it later). */
export async function postWhenChartApproved(tx: Tx, input: EntryInput): Promise<string | null> {
  if (!(await accountsReady(tx, input.lines.map((l) => l.account)))) return null
  const { entry } = await postEntry(tx, input)
  return entry.entryNumber
}
