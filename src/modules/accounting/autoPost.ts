// Shared rules for entries the system posts on its own (loan and
// contribution events). They wait until every account they use has been
// approved (the chart of accounts is "proposed" until the accountant signs
// it off, Gate #1 A13); the caller records the event either way and posts
// the backlog on a later run. Idempotency keys make repeats harmless.
import type { Prisma } from '@prisma/client'
import { type IsoDate, isoDateOf } from '@/lib/dates'
import { type EntryInput, lockPeriodsShared, postEntry } from './ledger'

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

/**
 * The date to post a money event on. Months close in order (F-11), so a
 * date in a closed month moves to the first day of the first open month:
 * a payment dated September but recorded after September was closed goes
 * into October, as the correction rule requires (docs/architecture/04 §4).
 */
export async function openPostingDate(tx: Pick<Tx, 'ledgerPeriod' | '$executeRaw'>, date: IsoDate): Promise<IsoDate> {
  // Held until the transaction ends, so no month can close between choosing the date and posting.
  await lockPeriodsShared(tx)
  const latestClosed = await tx.ledgerPeriod.findFirst({ where: { status: 'closed' }, orderBy: { period: 'desc' }, select: { period: true } })
  if (!latestClosed || date.slice(0, 7) > latestClosed.period) return date
  const [y, m] = latestClosed.period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
}

/**
 * Post an entry the system makes on its own (a money event). A new one
 * dated in a closed month posts on the first open day, with its own date in
 * the description. An event already in the ledger is checked against the
 * entry as it was posted (same moved date), so an unchanged retry replays
 * even after its month closed, and different content under the same key is
 * still refused as an idempotency conflict.
 */
export async function postMoneyEvent(tx: Tx, input: EntryInput): Promise<{ entryNumber: string; replayed: boolean }> {
  const existing = await tx.journalEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { effectiveDate: true } })
  const effectiveDate = existing ? isoDateOf(existing.effectiveDate) : await openPostingDate(tx, input.effectiveDate)
  const moved = effectiveDate === input.effectiveDate
    ? input
    : { ...input, effectiveDate, description: `${input.description} (dated ${input.effectiveDate}; that month is closed)` }
  const { entry, replayed } = await postEntry(tx, moved)
  return { entryNumber: entry.entryNumber, replayed }
}

/** Post the entry if every account it uses is approved; otherwise null (post it later). */
export async function postWhenChartApproved(tx: Tx, input: EntryInput): Promise<string | null> {
  if (!(await accountsReady(tx, input.lines.map((l) => l.account)))) return null
  return (await postMoneyEvent(tx, input)).entryNumber
}

// ── Opening balances (M4) ──────────────────────────────────────────────

export const OPENING_KEYS = {
  capital: 'm4:opening:capital',
  bank: 'm4:opening:bank',
  loans: 'm4:opening:loans',
} as const

/** Whether opening balances have been posted, and from which cutover (first day of ledger activity). */
export async function ledgerOpening(db: Pick<Tx, 'journalEntry'>): Promise<{ cutover: string; entryNumber: string } | null> {
  const entry = await db.journalEntry.findFirst({
    where: { idempotencyKey: { in: Object.values(OPENING_KEYS) } },
    orderBy: [{ postedAt: 'asc' }, { entryNumber: 'asc' }],
    select: { sourceId: true, entryNumber: true },
  })
  return entry ? { cutover: entry.sourceId!, entryNumber: entry.entryNumber } : null
}
