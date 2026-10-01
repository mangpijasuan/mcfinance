// The general ledger against a real PostgreSQL database: the invariants in
// docs/architecture/04 §4 hold both through the posting service and when
// the service is bypassed (database triggers and constraints).
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from './helpers/db'
import { createLoan, createMember } from './helpers/factories'
import { parseDollars as $ } from '@/lib/money'
import {
  LedgerError, accountBalance, approveAccounts, checkInvariants, postEntry, reverseEntry, trialBalance,
  type EntryInput,
} from '@/modules/accounting/ledger'

const ALL_CODES = ['1000', '1010', '1020', '1030', '1100', '1110', '1190', '2000', '2100', '2200', '3000', '4000', '4010', '4900', '5000', '5010', '5100', '9000']

async function approveChart() {
  await prisma.$transaction((tx) => approveAccounts(tx, { codes: ALL_CODES, approvedBy: 'staff-treasurer', note: 'Test accountant, letter of 2026-09-01' }))
}

const post = (input: EntryInput) => prisma.$transaction((tx) => postEntry(tx, input))

const contribution = (key: string, amount = '20.00', memberId = 'MC-L1'): EntryInput => ({
  effectiveDate: '2026-09-15',
  type: 'contribution',
  description: 'Monthly contribution by card',
  idempotencyKey: key,
  source: { type: 'portal_payment', id: key },
  lines: [
    { account: '1010', debit: $(amount) },
    { account: '2000', credit: $(amount), memberId },
  ],
  createdBy: 'system',
})

beforeEach(async () => {
  await resetDatabase()
  await createMember('MC-L1')
  await createMember('MC-L2')
  await createLoan('LN-L1', 'MC-L1')
})

describe('chart of accounts', () => {
  it('starts as the proposed chart, and nothing can be posted until it is approved', async () => {
    const accounts = await prisma.ledgerAccount.findMany()
    expect(accounts).toHaveLength(18)
    expect(accounts.every((a) => a.status === 'proposed')).toBe(true)
    await expect(post(contribution('k1'))).rejects.toMatchObject({ code: 'account_not_approved' })
  })

  it('refuses a direct insert to an unapproved account at the database', async () => {
    await expect(prisma.journalEntry.create({
      data: {
        entryNumber: 'JE-X', effectiveDate: new Date('2026-09-15'), type: 'adjustment', description: 'bypass',
        idempotencyKey: 'bypass', requestHash: 'x',
        lines: { create: [
          { lineNo: 1, accountCode: '1000', debitCents: BigInt(100) },
          { lineNo: 2, accountCode: '3000', creditCents: BigInt(100) },
        ] },
      },
    })).rejects.toThrow(/not approved for posting/)
  })

  it('freezes an approved account’s meaning', async () => {
    await prisma.ledgerAccount.update({ where: { code: '4900' }, data: { name: 'Other income (renamed while proposed)' } })
    await approveChart()
    await expect(prisma.ledgerAccount.update({ where: { code: '2000' }, data: { type: 'equity' } })).rejects.toThrow(/cannot change/)
    await expect(prisma.ledgerAccount.update({ where: { code: '2000' }, data: { status: 'proposed' } })).rejects.toThrow(/cannot change/)
    await expect(prisma.ledgerAccount.delete({ where: { code: '5100' } })).rejects.toThrow(/cannot be deleted/)
    await prisma.ledgerAccount.update({ where: { code: '2000' }, data: { name: 'Member capital (renamed)' } })
  })

  it('requires a note naming who confirmed the chart', async () => {
    await expect(prisma.$transaction((tx) => approveAccounts(tx, { codes: ['1000'], approvedBy: 'x', note: '  ' }))).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('posting', () => {
  beforeEach(approveChart)

  it('posts a balanced entry and updates balances', async () => {
    const { entry, replayed } = await post(contribution('stripe:evt_1'))
    expect(replayed).toBe(false)
    expect(entry.entryNumber).toMatch(/^JE-2026-\d{6}$/)
    expect(entry.lines).toHaveLength(2)
    expect(await accountBalance(prisma, '1010')).toEqual({ debit: 2000, credit: 0, balance: 2000 })
    expect((await accountBalance(prisma, '2000', { memberId: 'MC-L1' })).balance).toBe(2000)
    expect((await accountBalance(prisma, '2000', { memberId: 'MC-L2' })).balance).toBe(0)
  })

  it('posts the netted application fee from the docs (Gate #1 A8)', async () => {
    await post({
      effectiveDate: '2026-09-20', type: 'loan_disbursement', description: 'Loan LN-L1 disbursed, $70 fee netted',
      idempotencyKey: 'disburse:LN-L1', createdBy: 'staff-treasurer', approvedBy: 'staff-board',
      lines: [
        { account: '1100', debit: $('5000'), memberId: 'MC-L1', loanId: 'LN-L1' },
        { account: '1000', credit: $('4930') },
        { account: '4000', credit: $('70') },
      ],
    })
    expect((await accountBalance(prisma, '1100', { loanId: 'LN-L1' })).balance).toBe($('5000'))
    expect((await accountBalance(prisma, '1000')).balance).toBe(-$('4930'))
    expect((await accountBalance(prisma, '4000')).balance).toBe($('70'))
    expect(await checkInvariants(prisma)).toEqual({ ok: true, problems: [] }) // maker ≠ checker here
  })

  it.each([
    ['one line', { lines: [{ account: '1000', debit: $('1') }] }, 'unbalanced'],
    ['unbalanced', { lines: [{ account: '1000', debit: $('1') }, { account: '3000', credit: $('2') }] }, 'unbalanced'],
    ['both sides on a line', { lines: [{ account: '1000', debit: $('1'), credit: $('1') }, { account: '3000', credit: $('1') }] }, 'invalid'],
    ['a zero line', { lines: [{ account: '1000' }, { account: '3000', credit: $('1') }, { account: '5010', debit: $('1') }] }, 'invalid'],
    ['a negative amount', { lines: [{ account: '1000', debit: -1 }, { account: '3000', credit: -1 }] }, 'invalid'],
    ['fractional cents', { lines: [{ account: '1000', debit: 1.5 }, { account: '3000', credit: 1.5 }] }, 'invalid'],
    ['a bad account code', { lines: [{ account: '10', debit: $('1') }, { account: '3000', credit: $('1') }] }, 'invalid'],
    ['an unknown account', { lines: [{ account: '1234', debit: $('1') }, { account: '3000', credit: $('1') }] }, 'unknown_account'],
    ['a member account without a member', { lines: [{ account: '1000', debit: $('1') }, { account: '2000', credit: $('1') }] }, 'subledger_required'],
    ['a loan account without a loan', { lines: [{ account: '1100', debit: $('1'), memberId: 'MC-L1' }, { account: '1000', credit: $('1') }] }, 'subledger_required'],
    ['a bad date', { effectiveDate: '2026-13-01' }, 'invalid'],
    ['no description', { description: ' ' }, 'invalid'],
    ['an unknown type', { type: 'magic' }, 'invalid'],
    ['maker = checker', { createdBy: 'staff-x', approvedBy: 'staff-x' }, 'maker_is_checker'],
    ['no idempotency key', { idempotencyKey: '' }, 'invalid'],
  ] as const)('refuses %s', async (_, patch, code) => {
    await expect(post({ ...contribution('bad'), ...(patch as object) } as EntryInput)).rejects.toMatchObject({ code })
    expect(await prisma.journalEntry.count()).toBe(0)
  })

  it('is idempotent: a replay returns the original, different content is refused', async () => {
    const first = await post(contribution('zelle-confirm:pp1'))
    const again = await post(contribution('zelle-confirm:pp1'))
    expect(again).toEqual({ entry: first.entry, replayed: true })
    await expect(post(contribution('zelle-confirm:pp1', '25.00'))).rejects.toMatchObject({ code: 'idempotency_conflict' })
    expect(await prisma.journalEntry.count()).toBe(1)
  })

  it('posts one entry when the same event arrives concurrently', async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => post(contribution('stripe:evt_dup'))))
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(await prisma.journalEntry.count()).toBe(1)
  })
})

describe('the database refuses what the service would', () => {
  beforeEach(approveChart)

  it('an entry that does not balance cannot commit', async () => {
    await expect(prisma.journalEntry.create({
      data: {
        entryNumber: 'JE-UNBAL', effectiveDate: new Date('2026-09-15'), type: 'adjustment', description: 'bypass',
        idempotencyKey: 'unbal', requestHash: 'x',
        lines: { create: [
          { lineNo: 1, accountCode: '1000', debitCents: BigInt(100) },
          { lineNo: 2, accountCode: '3000', creditCents: BigInt(99) },
        ] },
      },
    })).rejects.toThrow(/does not balance/)
    expect(await prisma.journalEntry.count()).toBe(0)
  })

  it('an entry with no lines cannot commit', async () => {
    await expect(prisma.journalEntry.create({
      data: { entryNumber: 'JE-EMPTY', effectiveDate: new Date('2026-09-15'), type: 'adjustment', description: 'bypass', idempotencyKey: 'empty', requestHash: 'x' },
    })).rejects.toThrow(/does not balance/)
  })

  it('a line cannot be both debit and credit', async () => {
    await expect(prisma.journalEntry.create({
      data: {
        entryNumber: 'JE-BOTH', effectiveDate: new Date('2026-09-15'), type: 'adjustment', description: 'bypass', idempotencyKey: 'both', requestHash: 'x',
        lines: { create: [
          { lineNo: 1, accountCode: '1000', debitCents: BigInt(100), creditCents: BigInt(100) },
          { lineNo: 2, accountCode: '3000', creditCents: BigInt(0), debitCents: BigInt(0) },
        ] },
      },
    })).rejects.toThrow(/JournalLine_amounts_check/)
  })

  it('posted entries and lines cannot be changed, deleted or truncated', async () => {
    const { entry } = await post(contribution('k-immutable'))
    await expect(prisma.journalEntry.update({ where: { id: entry.id }, data: { description: 'edited' } })).rejects.toThrow(/append-only/)
    await expect(prisma.journalEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/)
    await expect(prisma.journalLine.updateMany({ where: { entryId: entry.id }, data: { creditCents: BigInt(1) } })).rejects.toThrow(/append-only/)
    await expect(prisma.journalLine.deleteMany({ where: { entryId: entry.id } })).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRawUnsafe('TRUNCATE "JournalLine"')).rejects.toThrow(/append-only/)
    expect((await accountBalance(prisma, '1010')).balance).toBe(2000)
  })
})

describe('reversals', () => {
  beforeEach(approveChart)

  it('restore the exact prior balances, and happen at most once', async () => {
    const { entry } = await post(contribution('k-rev'))
    const reversal = await prisma.$transaction((tx) => reverseEntry(tx, entry.id, { effectiveDate: '2026-09-16', reason: 'keyed against the wrong member', createdBy: 'staff-finance' }))
    expect(reversal.type).toBe('reversal')
    expect(reversal.reversesEntryId).toBe(entry.id)
    expect(reversal.lines.map((l) => [l.account, l.debit, l.credit])).toEqual([['1010', 0, 2000], ['2000', 2000, 0]])
    expect((await accountBalance(prisma, '1010')).balance).toBe(0)
    expect((await accountBalance(prisma, '2000', { memberId: 'MC-L1' })).balance).toBe(0)

    await expect(prisma.$transaction((tx) => reverseEntry(tx, entry.id, { effectiveDate: '2026-09-16', reason: 'again' }))).rejects.toMatchObject({ code: 'already_reversed' })
    await expect(prisma.$transaction((tx) => reverseEntry(tx, reversal.id, { effectiveDate: '2026-09-16', reason: 'undo' }))).rejects.toMatchObject({ code: 'cannot_reverse_reversal' })
    await expect(prisma.$transaction((tx) => reverseEntry(tx, 'nope', { effectiveDate: '2026-09-16', reason: 'x' }))).rejects.toMatchObject({ code: 'not_found' })
    await expect(prisma.$transaction((tx) => reverseEntry(tx, entry.id, { effectiveDate: '2026-09-16', reason: ' ' }))).rejects.toBeInstanceOf(LedgerError)
  })

  it('reverses an entry that has no source record', async () => {
    const { entry } = await post({
      effectiveDate: '2026-09-15', type: 'expense', description: 'Hosting', idempotencyKey: 'hosting-sep',
      lines: [{ account: '5010', debit: $('12.00') }, { account: '1000', credit: $('12.00') }],
    })
    const reversal = await prisma.$transaction((tx) => reverseEntry(tx, entry.id, { effectiveDate: '2026-09-15', reason: 'duplicate bill' }))
    expect(reversal.sourceType).toBeNull()
    expect((await accountBalance(prisma, '5010')).balance).toBe(0)
  })

  it('two officers reversing at once produce one reversal', async () => {
    const { entry } = await post(contribution('k-rev2'))
    const results = await Promise.allSettled([1, 2, 3].map(() =>
      prisma.$transaction((tx) => reverseEntry(tx, entry.id, { effectiveDate: '2026-09-16', reason: 'duplicate' }))))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.journalEntry.count({ where: { reversesEntryId: entry.id } })).toBe(1)
  })
})

describe('periods', () => {
  beforeEach(approveChart)

  it('a closed period accepts no entries and cannot be reopened', async () => {
    await prisma.ledgerPeriod.create({ data: { period: '2026-08', status: 'closed', closedAt: new Date(), closedBy: 'staff-treasurer' } })
    await expect(post({ ...contribution('k-aug'), effectiveDate: '2026-08-31' })).rejects.toThrow(/Period 2026-08 is closed/)
    await post({ ...contribution('k-sep'), effectiveDate: '2026-09-01' })
    await expect(prisma.ledgerPeriod.update({ where: { period: '2026-08' }, data: { status: 'open' } })).rejects.toThrow(/cannot be changed/)
  })
})

describe('reports and invariants', () => {
  beforeEach(approveChart)

  it('the trial balance always balances, and can be run as of a past date', async () => {
    await post(contribution('a', '20.00'))
    await post({ ...contribution('b', '35.50', 'MC-L2'), effectiveDate: '2026-09-30' })
    await post({
      effectiveDate: '2026-09-30', type: 'fee', description: 'Stripe fee', idempotencyKey: 'fee-b',
      lines: [{ account: '5000', debit: $('1.33') }, { account: '1010', credit: $('1.33') }],
    })
    const tb = await trialBalance(prisma)
    expect(tb.balanced).toBe(true)
    expect(tb.totalDebit).toBe($('56.83'))
    expect(tb.rows.find((r) => r.code === '1010')?.balance).toBe($('54.17'))
    const earlier = await trialBalance(prisma, '2026-09-20')
    expect(earlier.totalDebit).toBe($('20.00'))
    expect((await accountBalance(prisma, '2000', { asOf: '2026-09-20' })).balance).toBe($('20.00'))
    expect(await checkInvariants(prisma)).toEqual({ ok: true, problems: [] })
  })

  it('flags a loan receivable that goes negative', async () => {
    await post({
      effectiveDate: '2026-09-15', type: 'loan_repayment', description: 'repayment with no disbursement on record', idempotencyKey: 'neg',
      lines: [{ account: '1000', debit: $('100') }, { account: '1100', credit: $('100'), memberId: 'MC-L1', loanId: 'LN-L1' }],
    })
    const result = await checkInvariants(prisma)
    expect(result.ok).toBe(false)
    expect(result.problems).toEqual(['loan LN-L1 has a negative receivable'])
  })

  it('catches tampering even if someone bypasses the database guards', async () => {
    // Simulates a database owner switching the triggers off: the nightly
    // check must still find what they did.
    const { entry } = await post(contribution('orig'))
    await prisma.$executeRawUnsafe('ALTER TABLE "JournalLine" DISABLE TRIGGER USER')
    await prisma.$executeRawUnsafe('ALTER TABLE "JournalEntry" DISABLE TRIGGER USER')
    try {
      await prisma.journalEntry.create({ data: {
        entryNumber: 'JE-TAMPER-1', effectiveDate: new Date('2026-09-15'), type: 'adjustment', description: 'x', idempotencyKey: 't1', requestHash: 'x',
        createdBy: 'staff-x', approvedBy: 'staff-x',
        lines: { create: [{ lineNo: 1, accountCode: '1000', debitCents: BigInt(500) }, { lineNo: 2, accountCode: '3000', creditCents: BigInt(1) }] },
      } })
      await prisma.journalEntry.create({ data: {
        entryNumber: 'JE-TAMPER-2', effectiveDate: new Date('2026-09-15'), type: 'reversal', description: 'bad reversal', idempotencyKey: 't2', requestHash: 'x',
        reversesEntryId: entry.id,
        lines: { create: [{ lineNo: 1, accountCode: '1010', creditCents: BigInt(1500) }, { lineNo: 2, accountCode: '2000', memberId: 'MC-L1', debitCents: BigInt(1500) }] },
      } })
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "JournalEntry" ENABLE TRIGGER USER')
      await prisma.$executeRawUnsafe('ALTER TABLE "JournalLine" ENABLE TRIGGER USER')
    }
    const result = await checkInvariants(prisma)
    expect(result.ok).toBe(false)
    expect(result.problems).toEqual(expect.arrayContaining([
      'entry JE-TAMPER-1 does not balance',
      expect.stringMatching(/^trial balance: debits/),
      'reversal JE-TAMPER-2 does not mirror its original',
      'entry JE-TAMPER-1: maker is also checker',
    ]))
  })

  it('reports unknown accounts clearly', async () => {
    await expect(accountBalance(prisma, '7777')).rejects.toMatchObject({ code: 'unknown_account' })
  })
})
