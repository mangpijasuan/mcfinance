// Posting service for the general ledger (D-04, D-05). The only way money
// enters the books. The database enforces the invariants as well (see
// migration 20260927010000_ledger); this module checks them first so
// callers get clear errors, and adds idempotency and reversal.
//
// Posting takes a transaction client: an entry must commit together with
// the domain change that caused it (a payment, a disbursement, …).
import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { type Cents, add, cents, fromBigInt, subtract, sum, toBigInt } from '@/lib/money'
import type { IsoDate } from '@/modules/loans/amortization'

type Tx = Prisma.TransactionClient
type Db = PrismaClient | Prisma.TransactionClient

export const ENTRY_TYPES = [
  'contribution', 'loan_disbursement', 'loan_repayment', 'fee', 'fee_waiver', 'withdrawal', 'deposit',
  'transfer', 'expense', 'adjustment', 'reversal', 'opening_balance', 'write_off',
] as const
export type EntryType = (typeof ENTRY_TYPES)[number]

export type LineInput = {
  account: string
  debit?: Cents
  credit?: Cents
  memberId?: string | null
  loanId?: string | null
  memo?: string | null
}

export type EntryInput = {
  effectiveDate: IsoDate
  type: EntryType
  description: string
  reference?: string | null
  source?: { type: string; id: string } | null
  /** Unique per business event, e.g. "stripe:evt_…", "zelle-confirm:<id>". */
  idempotencyKey: string
  lines: LineInput[]
  createdBy?: string | null
  approvedBy?: string | null
}

export type PostedLine = {
  lineNo: number
  account: string
  memberId: string | null
  loanId: string | null
  debit: Cents
  credit: Cents
  memo: string | null
}

export type PostedEntry = {
  id: string
  entryNumber: string
  effectiveDate: IsoDate
  type: string
  description: string
  reference: string | null
  sourceType: string | null
  sourceId: string | null
  idempotencyKey: string
  reversesEntryId: string | null
  createdBy: string | null
  approvedBy: string | null
  postedAt: Date
  lines: PostedLine[]
}

export type LedgerErrorCode =
  | 'invalid'
  | 'unbalanced'
  | 'unknown_account'
  | 'account_not_approved'
  | 'subledger_required'
  | 'maker_is_checker'
  | 'idempotency_conflict'
  | 'not_found'
  | 'already_reversed'
  | 'cannot_reverse_reversal'

export class LedgerError extends Error {
  constructor(public code: LedgerErrorCode, message: string) {
    super(message)
    this.name = 'LedgerError'
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Pure checks, before touching the database. Returns the totals. */
export function validateEntry(input: EntryInput): { debits: Cents; credits: Cents } {
  if (!ISO_DATE.test(input.effectiveDate) || Number.isNaN(Date.parse(`${input.effectiveDate}T00:00:00Z`))) {
    throw new LedgerError('invalid', `effectiveDate must be YYYY-MM-DD, got "${input.effectiveDate}"`)
  }
  if (!ENTRY_TYPES.includes(input.type)) throw new LedgerError('invalid', `unknown entry type "${input.type}"`)
  if (!input.description?.trim()) throw new LedgerError('invalid', 'description is required')
  if (!input.idempotencyKey?.trim()) throw new LedgerError('invalid', 'idempotencyKey is required')
  if (input.lines.length < 2) throw new LedgerError('unbalanced', 'an entry needs at least two lines')
  if (input.createdBy && input.approvedBy && input.createdBy === input.approvedBy) {
    throw new LedgerError('maker_is_checker', 'the approver must be a different person from the maker (D-06)')
  }
  const debits: Cents[] = []
  const credits: Cents[] = []
  input.lines.forEach((line, i) => {
    const d = line.debit ?? 0
    const c = line.credit ?? 0
    if (!/^\d{4}$/.test(line.account)) throw new LedgerError('invalid', `line ${i + 1}: account must be a 4-digit code`)
    if (!Number.isSafeInteger(d) || !Number.isSafeInteger(c) || d < 0 || c < 0 || (d > 0) === (c > 0)) {
      throw new LedgerError('invalid', `line ${i + 1}: exactly one of debit or credit must be a positive number of cents`)
    }
    debits.push(cents(d))
    credits.push(cents(c))
  })
  const totalDebits = sum(debits)
  const totalCredits = sum(credits)
  if (totalDebits !== totalCredits) {
    throw new LedgerError('unbalanced', `debits ${totalDebits} ≠ credits ${totalCredits} (cents)`)
  }
  return { debits: totalDebits, credits: totalCredits }
}

function requestHash(input: EntryInput): string {
  const canonical = {
    effectiveDate: input.effectiveDate,
    type: input.type,
    description: input.description.trim(),
    reference: input.reference ?? null,
    source: input.source ?? null,
    lines: input.lines.map((l) => ({
      account: l.account, debit: l.debit ?? 0, credit: l.credit ?? 0,
      memberId: l.memberId ?? null, loanId: l.loanId ?? null, memo: l.memo ?? null,
    })),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

const entryInclude = { lines: { orderBy: { lineNo: 'asc' as const } } }

type EntryRow = Prisma.JournalEntryGetPayload<{ include: typeof entryInclude }>

function toPosted(row: EntryRow): PostedEntry {
  return {
    id: row.id,
    entryNumber: row.entryNumber,
    effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
    type: row.type,
    description: row.description,
    reference: row.reference,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    idempotencyKey: row.idempotencyKey,
    reversesEntryId: row.reversesEntryId,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    postedAt: row.postedAt,
    lines: row.lines.map((l) => ({
      lineNo: l.lineNo,
      account: l.accountCode,
      memberId: l.memberId,
      loanId: l.loanId,
      debit: fromBigInt(l.debitCents),
      credit: fromBigInt(l.creditCents),
      memo: l.memo,
    })),
  }
}

export async function getEntry(db: Db, id: string): Promise<PostedEntry | null> {
  const row = await db.journalEntry.findUnique({ where: { id }, include: entryInclude })
  return row ? toPosted(row) : null
}

async function insertEntry(tx: Tx, input: EntryInput, reversesEntryId: string | null): Promise<PostedEntry> {
  const codes = Array.from(new Set(input.lines.map((l) => l.account)))
  const accounts = await tx.ledgerAccount.findMany({ where: { code: { in: codes } } })
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  input.lines.forEach((line, i) => {
    const account = byCode.get(line.account)
    if (!account) throw new LedgerError('unknown_account', `line ${i + 1}: no account ${line.account}`)
    if (account.status !== 'approved') {
      throw new LedgerError('account_not_approved', `account ${line.account} is ${account.status}; the chart of accounts must be approved before posting`)
    }
    if ((account.subledger === 'member' || account.subledger === 'loan') && !line.memberId) {
      throw new LedgerError('subledger_required', `line ${i + 1}: account ${line.account} needs a member`)
    }
    if (account.subledger === 'loan' && !line.loanId) {
      throw new LedgerError('subledger_required', `line ${i + 1}: account ${line.account} needs a loan`)
    }
  })

  const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('journal_entry_number_seq')`
  const entryNumber = `JE-${input.effectiveDate.slice(0, 4)}-${String(nextval).padStart(6, '0')}`

  const row = await tx.journalEntry.create({
    data: {
      entryNumber,
      effectiveDate: new Date(`${input.effectiveDate}T00:00:00Z`),
      type: input.type,
      description: input.description.trim(),
      reference: input.reference ?? null,
      sourceType: input.source?.type ?? null,
      sourceId: input.source?.id ?? null,
      idempotencyKey: input.idempotencyKey,
      requestHash: requestHash(input),
      reversesEntryId,
      createdBy: input.createdBy ?? null,
      approvedBy: input.approvedBy ?? null,
      lines: {
        create: input.lines.map((l, i) => ({
          lineNo: i + 1,
          accountCode: l.account,
          memberId: l.memberId ?? null,
          loanId: l.loanId ?? null,
          debitCents: toBigInt(l.debit ?? cents(0)),
          creditCents: toBigInt(l.credit ?? cents(0)),
          memo: l.memo ?? null,
        })),
      },
    },
    include: entryInclude,
  })
  return toPosted(row)
}

/**
 * Post a balanced entry. Posting the same idempotency key again returns
 * the original entry (replayed: true); the same key with different
 * content is refused. Concurrent posts of one key are serialised.
 */
export async function postEntry(tx: Tx, input: EntryInput): Promise<{ entry: PostedEntry; replayed: boolean }> {
  validateEntry(input)
  // Serialise concurrent posts of the same business event.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`
  const existing = await tx.journalEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: entryInclude })
  if (existing) {
    if (existing.requestHash !== requestHash(input)) {
      throw new LedgerError('idempotency_conflict', `idempotency key ${input.idempotencyKey} was already used for a different entry (${existing.entryNumber})`)
    }
    return { entry: toPosted(existing), replayed: true }
  }
  return { entry: await insertEntry(tx, input, null), replayed: false }
}

/**
 * Reverse a posted entry: a new entry with every line's debit and credit
 * swapped, linked to the original. An entry can be reversed at most once,
 * and a reversal cannot itself be reversed (post a fresh entry instead).
 */
export async function reverseEntry(
  tx: Tx,
  entryId: string,
  opts: { effectiveDate: IsoDate; reason: string; createdBy?: string | null; approvedBy?: string | null },
): Promise<PostedEntry> {
  if (!opts.reason?.trim()) throw new LedgerError('invalid', 'a reason is required to reverse an entry')
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reversal:${entryId}`}, 0))`
  const original = await getEntry(tx, entryId)
  if (!original) throw new LedgerError('not_found', `no entry ${entryId}`)
  if (original.reversesEntryId) throw new LedgerError('cannot_reverse_reversal', `${original.entryNumber} is itself a reversal`)
  const already = await tx.journalEntry.findUnique({ where: { reversesEntryId: entryId }, select: { entryNumber: true } })
  if (already) throw new LedgerError('already_reversed', `${original.entryNumber} was already reversed by ${already.entryNumber}`)

  const input: EntryInput = {
    effectiveDate: opts.effectiveDate,
    type: 'reversal',
    description: `Reversal of ${original.entryNumber}: ${opts.reason.trim()}`,
    reference: original.reference,
    source: original.sourceType && original.sourceId ? { type: original.sourceType, id: original.sourceId } : null,
    idempotencyKey: `reversal:${entryId}`,
    lines: original.lines.map((l) => ({
      account: l.account,
      debit: l.credit,
      credit: l.debit,
      memberId: l.memberId,
      loanId: l.loanId,
      memo: l.memo,
    })),
    createdBy: opts.createdBy,
    approvedBy: opts.approvedBy,
  }
  validateEntry(input)
  return insertEntry(tx, input, entryId)
}

// ── Reading the books ──────────────────────────────────────────────────

export type Balance = { debit: Cents; credit: Cents; balance: Cents }

type Sums = { debit: bigint | null; credit: bigint | null }

function toBalance(row: Sums | undefined, normalBalance: string): Balance {
  const debit = fromBigInt(row?.debit ?? BigInt(0))
  const credit = fromBigInt(row?.credit ?? BigInt(0))
  return { debit, credit, balance: normalBalance === 'debit' ? subtract(debit, credit) : subtract(credit, debit) }
}

/** An account's balance (in its normal direction), optionally for one member or loan, as of a date. */
export async function accountBalance(
  db: Db,
  code: string,
  opts: { asOf?: IsoDate; memberId?: string; loanId?: string } = {},
): Promise<Balance> {
  const account = await db.ledgerAccount.findUnique({ where: { code } })
  if (!account) throw new LedgerError('unknown_account', `no account ${code}`)
  const agg = await db.journalLine.aggregate({
    where: {
      accountCode: code,
      ...(opts.memberId ? { memberId: opts.memberId } : {}),
      ...(opts.loanId ? { loanId: opts.loanId } : {}),
      ...(opts.asOf ? { entry: { effectiveDate: { lte: new Date(`${opts.asOf}T00:00:00Z`) } } } : {}),
    },
    _sum: { debitCents: true, creditCents: true },
  })
  return toBalance({ debit: agg._sum.debitCents, credit: agg._sum.creditCents }, account.normalBalance)
}

export type TrialBalanceRow = Balance & { code: string; name: string; type: string; normalBalance: string; status: string }

export async function trialBalance(db: Db, asOf?: IsoDate) {
  const accounts = await db.ledgerAccount.findMany({ orderBy: { code: 'asc' } })
  const sums = await db.journalLine.groupBy({
    by: ['accountCode'],
    where: asOf ? { entry: { effectiveDate: { lte: new Date(`${asOf}T00:00:00Z`) } } } : {},
    _sum: { debitCents: true, creditCents: true },
  })
  const byCode = new Map(sums.map((s) => [s.accountCode, { debit: s._sum.debitCents, credit: s._sum.creditCents }]))
  const rows: TrialBalanceRow[] = accounts.map((a) => ({
    code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance, status: a.status,
    ...toBalance(byCode.get(a.code), a.normalBalance),
  }))
  const totalDebit = rows.reduce((t, r) => add(t, r.debit), cents(0))
  const totalCredit = rows.reduce((t, r) => add(t, r.credit), cents(0))
  return { asOf: asOf ?? null, rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit }
}

/**
 * The ledger invariants (docs/architecture/04 §4), checked across the
 * whole ledger. Meant for a nightly job that alerts on any problem.
 */
export async function checkInvariants(db: Db): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = []

  const unbalanced = await db.$queryRaw<{ entryNumber: string }[]>`
    SELECT e."entryNumber" FROM "JournalEntry" e JOIN "JournalLine" l ON l."entryId" = e.id
    GROUP BY e.id, e."entryNumber"
    HAVING SUM(l."debitCents") <> SUM(l."creditCents") OR SUM(l."debitCents") = 0 OR COUNT(*) < 2`
  for (const u of unbalanced) problems.push(`entry ${u.entryNumber} does not balance`)

  const tb = await trialBalance(db)
  if (!tb.balanced) problems.push(`trial balance: debits ${tb.totalDebit} ≠ credits ${tb.totalCredit}`)

  const mismatched = await db.$queryRaw<{ entryNumber: string }[]>`
    WITH signed AS (
      SELECT l."entryId", l."accountCode", COALESCE(l."memberId", '') AS m, COALESCE(l."loanId", '') AS n,
             SUM(l."debitCents" - l."creditCents") AS net
      FROM "JournalLine" l GROUP BY 1, 2, 3, 4
    )
    SELECT DISTINCT r."entryNumber" FROM "JournalEntry" r
    JOIN signed rs ON rs."entryId" = r.id
    LEFT JOIN signed os ON os."entryId" = r."reversesEntryId" AND os."accountCode" = rs."accountCode" AND os.m = rs.m AND os.n = rs.n
    WHERE r."reversesEntryId" IS NOT NULL AND (os.net IS NULL OR os.net <> -rs.net)`
  for (const m of mismatched) problems.push(`reversal ${m.entryNumber} does not mirror its original`)

  const negativeLoans = await db.$queryRaw<{ loanId: string }[]>`
    SELECT "loanId" FROM "JournalLine" WHERE "accountCode" = '1100' AND "loanId" IS NOT NULL
    GROUP BY "loanId" HAVING SUM("debitCents" - "creditCents") < 0`
  for (const l of negativeLoans) problems.push(`loan ${l.loanId} has a negative receivable`)

  const sameHands = await db.journalEntry.findMany({
    where: { approvedBy: { not: null }, createdBy: { not: null } },
    select: { entryNumber: true, createdBy: true, approvedBy: true },
  })
  for (const e of sameHands) if (e.createdBy === e.approvedBy) problems.push(`entry ${e.entryNumber}: maker is also checker`)

  return { ok: problems.length === 0, problems }
}

/**
 * Record the accountant's confirmation of the chart of accounts
 * (Gate #1 A13). Until then nothing can be posted.
 */
export async function approveAccounts(tx: Tx, opts: { codes: string[]; approvedBy: string; note: string }) {
  if (!opts.note.trim()) throw new LedgerError('invalid', 'say who confirmed the chart of accounts, and when')
  const result = await tx.ledgerAccount.updateMany({
    where: { code: { in: opts.codes }, status: 'proposed' },
    data: { status: 'approved', approvedAt: new Date(), approvedBy: opts.approvedBy, approvalNote: opts.note.trim() },
  })
  return result.count
}
