// Reconciliation and month-end close (F-11): transfers from the clearing
// accounts to the bank, cash held by collectors, the monthly bank
// reconciliation, and closing months in order.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signInAs, staffId } from './helpers/actors'
import { auditEntriesSince, auditMarker, prisma, resetDatabase } from './helpers/db'
import { createBaseFixtures, createMember } from './helpers/factories'
import { callRoute } from './helpers/routes'
import { accountBalance, approveAccounts, checkInvariants } from '@/modules/accounting/ledger'
import { checkOpening, postOpeningBalances } from '@/modules/accounting/opening'
import { closeBlockers, reconciliationStatus } from '@/modules/accounting/reconciliation'
import { serviceDues } from '@/modules/contributions'
import { cents } from '@/lib/money'

vi.mock('@/modules/accounting/ledger', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/modules/accounting/ledger')>()
  return { ...original, checkInvariants: vi.fn(original.checkInvariants) }
})

const enforce = (on: boolean) => { process.env.MAKER_CHECKER_ENFORCED = on ? 'true' : '' }
const TODAY = '2026-09-30'

async function openLedger() {
  const codes = (await prisma.ledgerAccount.findMany({ select: { code: true } })).map((a) => a.code)
  await prisma.$transaction((tx) => approveAccounts(tx, { codes, approvedBy: staffId('treasurer'), note: 'test chart approval' }))
  const inputs = { cutover: '2026-01-01', bankBalanceCents: cents(5000_00), confirmedLoanBalances: {} }
  const plan = await prisma.$transaction((tx) => checkOpening(tx, inputs))
  await prisma.$transaction((tx) => postOpeningBalances(tx, { ...inputs, bankBalanceCents: cents(5000_00), openingHash: plan.openingHash },
    { maker: { id: staffId('treasurer'), email: '' }, checker: { id: staffId('board'), email: '' } },
    { actorType: 'system', actorId: null, actorLabel: 'test', ip: null, userAgent: null, requestId: null } as never), { timeout: 60_000 })
}

const contribute = (amount: string, paymentDate: string, paymentMethod: string, receivedBy?: string) =>
  callRoute('contributions', 'POST', { body: { memberId: 'M1', amount, paymentDate, paymentMethod, receivedBy } })
const transfer = (body: Record<string, unknown>) => callRoute('reconciliation/transfers', 'POST', { body })
const reconcile = (body: Record<string, unknown>) => callRoute('reconciliation/bank', 'POST', { body })
const close = (period: string) => callRoute('reconciliation/close', 'POST', { body: { period } })
const bankAt = async (asOf: string) => (await accountBalance(prisma, '1000', { asOf })).balance

beforeEach(async () => {
  await resetDatabase()
  await createBaseFixtures() // two older loans paid out 2026-01-15, $1,000 each
  await createMember('M1', { archiveLifetime: 1000, overallContributions: 1000, joinDate: new Date('2026-01-01') })
})
afterEach(() => enforce(false))

describe('before opening balances', () => {
  it('there is no ledger to reconcile', async () => {
    signInAs('auditor')
    expect((await callRoute('reconciliation', 'GET')).json).toEqual({ started: false })
    signInAs('treasurer')
    expect((await transfer({ fromAccount: '1020', amount: '10', bankDate: '2026-09-01' })).status).toBe(409)
    expect((await reconcile({ period: '2026-08', statementBalance: '100' })).status).toBe(409)
    expect((await close('2026-08')).json.blockers).toEqual(['Opening balances are not posted yet (M4).'])
  })
})

describe('with the ledger open', () => {
  beforeEach(openLedger)

  it('ages cash held by collectors and moves deposits to the bank', async () => {
    signInAs('finance')
    expect((await contribute('40', '2026-09-01', 'Cash', 'Pat Collector')).status).toBe(201)
    expect((await contribute('20', '2026-09-10', 'Cash', 'Pat Collector')).status).toBe(201)
    expect((await contribute('25', '2026-09-12', 'Zelle')).status).toBe(201)
    expect((await callRoute('loan-payments', 'POST', { body: { loanId: 'LN-TEST-A', amount: 30, paymentDate: '2026-09-15', paymentMethod: 'cash' } })).status).toBe(201)

    let status = await reconciliationStatus(prisma, TODAY)
    if (!status.started) throw new Error('unreachable')
    expect(status.clearing).toEqual([
      { code: '1010', name: 'Stripe', cents: 0 },
      { code: '1020', name: 'Zelle / bank transfer', cents: 25_00 },
      { code: '1030', name: 'Cash held by collectors', cents: 90_00 },
    ])
    expect(status.collectors).toEqual([
      expect.objectContaining({ collector: 'Not recorded', heldCents: 30_00, oldestHeld: '2026-09-15', ageDays: 15, overdue: true }),
      expect.objectContaining({ collector: 'Pat Collector', heldCents: 60_00, oldestHeld: '2026-09-01', ageDays: 29, overdue: true }),
    ])

    // Refused: more than the collector holds, more than the account holds, missing or odd fields.
    expect((await transfer({ fromAccount: '1030', collector: 'Pat Collector', amount: '70', bankDate: '2026-09-20' })).status).toBe(409)
    expect((await transfer({ fromAccount: '1010', amount: '1', bankDate: '2026-09-20' })).json.error).toMatch(/Stripe holds \$0\.00/)
    expect((await transfer({ fromAccount: '1030', amount: '10', bankDate: '2026-09-20' })).status).toBe(400) // no collector
    expect((await transfer({ fromAccount: '1030', collector: 'Sam Nobody', amount: '10', bankDate: '2026-09-20' })).json.error).toMatch(/Sam Nobody holds \$0\.00/)
    expect((await transfer({ fromAccount: '1020', amount: '10', bankDate: '2999-01-01' })).status).toBe(400)
    expect((await transfer({ fromAccount: '1020', amount: '10', bankDate: '2025-12-31' })).status).toBe(400)
    expect((await transfer({ fromAccount: '1020', amount: '0', bankDate: '2026-09-20' })).status).toBe(400)
    expect((await transfer({ fromAccount: '1000', amount: '10', bankDate: '2026-09-20' })).status).toBe(400)
    expect((await transfer({ fromAccount: '1020', amount: '1.234', bankDate: '2026-09-20' })).status).toBe(400)
    expect((await transfer({ fromAccount: '1020', amount: '10', bankDate: 'soon' })).status).toBe(400)
    expect((await callRoute('reconciliation/transfers', 'POST', { rawBody: 'not json' })).status).toBe(400)

    const marker = await auditMarker()
    const deposit = await transfer({ fromAccount: '1030', collector: 'Pat Collector', amount: '$40.00', bankDate: '2026-09-20', reference: 'slip 77' })
    expect(deposit.status).toBe(201)
    expect(deposit.json).toMatchObject({ amountCents: 40_00, collector: 'Pat Collector', recordedBy: staffId('finance'), approvedBy: null })
    const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { entryNumber: deposit.json.journalEntry }, include: { lines: { orderBy: { lineNo: 'asc' } } } })
    expect({ type: entry.type, reference: entry.reference }).toEqual({ type: 'deposit', reference: 'slip 77' })
    expect(entry.lines.map((l) => [l.accountCode, Number(l.debitCents), Number(l.creditCents), l.memo])).toEqual([['1000', 4000, 0, null], ['1030', 0, 4000, 'Collector: Pat Collector']])
    expect((await auditEntriesSince(marker)).map((a) => a.action)).toEqual(['reconciliation.transfer.record'])
    expect((await transfer({ fromAccount: '1020', amount: '25', bankDate: '2026-09-21' })).status).toBe(201)

    status = await reconciliationStatus(prisma, TODAY)
    if (!status.started) throw new Error('unreachable')
    expect(status.collectors.find((c) => c.collector === 'Pat Collector')).toMatchObject({ depositedCents: 40_00, heldCents: 20_00, oldestHeld: '2026-09-10' })
    expect(status.clearing.map((c) => c.cents)).toEqual([0, 0, 50_00])
    expect(status.transfers.map((t) => [t.fromAccount, t.amountCents])).toEqual([['1020', 25_00], ['1030', 40_00]])

    // A deposit under a name that never recorded cash (made outside the app) still shows, as a negative holding.
    await prisma.clearingTransfer.create({ data: { transferId: 'TR-OUT', fromAccount: '1030', amountCents: BigInt(5_00), bankDate: new Date('2026-09-22'), collector: 'Ghost', journalEntry: 'JE-OUT', recordedBy: 'x' } })
    const withGhost = await reconciliationStatus(prisma, TODAY)
    expect(withGhost.started && withGhost.collectors.find((c) => c.collector === 'Ghost')).toMatchObject({ receivedCents: 0, heldCents: -5_00, oldestHeld: null })

    const row = await prisma.clearingTransfer.findFirstOrThrow()
    await expect(prisma.clearingTransfer.update({ where: { id: row.id }, data: { note: 'x' } })).rejects.toThrow(/cannot be changed or deleted/)
    await expect(prisma.$executeRawUnsafe('TRUNCATE "ClearingTransfer"')).rejects.toThrow(/cannot be changed or deleted/)
  })

  it('needs the Treasurer to approve a deposit once maker/checker is on', async () => {
    signInAs('finance')
    await contribute('40', '2026-09-01', 'Cash', 'Pat Collector')
    enforce(true)
    const queued = await transfer({ fromAccount: '1030', collector: 'Pat Collector', amount: '40', bankDate: '2026-09-20' })
    expect(queued.status).toBe(202)
    expect(queued.json.approvalRequest.summary).toBe('$40.00 from Cash held by collectors (Pat Collector) reached the bank on 2026-09-20')
    signInAs('treasurer')
    expect((await callRoute('approvals/[id]/approve', 'POST', { params: { id: queued.json.approvalRequest.id }, body: {} })).status).toBe(200)
    expect(await prisma.clearingTransfer.findFirstOrThrow()).toMatchObject({ recordedBy: staffId('finance'), approvedBy: staffId('treasurer') })
  })

  it('reconciles the bank month by month and closes months in order', async () => {
    signInAs('treasurer')
    // Validation and timing.
    expect((await reconcile({ period: '2026-13', statementBalance: '1' })).status).toBe(400)
    expect((await reconcile({ period: '2026-08', statementBalance: 'lots' })).status).toBe(400)
    expect((await reconcile({ period: '2026-08', statementBalance: '1', items: [{ kind: 'gift', description: 'x', amount: '1' }] })).status).toBe(400)
    expect((await reconcile({ period: '2026-08', statementBalance: '1', items: [{ kind: 'deposit_in_transit', description: '', amount: '1' }] })).status).toBe(400)
    expect((await reconcile({ period: '2026-08', statementBalance: '1', items: Array.from({ length: 51 }, () => ({})) })).status).toBe(400)
    expect((await reconcile({ period: '2025-11', statementBalance: '1' })).json.error).toMatch(/starts in 2025-12/)
    expect((await reconcile({ period: '2999-01', statementBalance: '1' })).json.error).toMatch(/has not ended yet/)
    expect((await callRoute('reconciliation/bank', 'POST', { rawBody: '[' })).status).toBe(400)
    expect((await close('Sept')).status).toBe(400)
    expect((await callRoute('reconciliation/close', 'POST', { rawBody: '[' })).status).toBe(400)

    // Months close in order, only once reconciled.
    expect((await close('2025-11')).json.blockers).toEqual(['The ledger starts in 2025-12.'])
    expect(await closeBlockers(prisma, '2025-12', '2025-12-20')).toContain('2025-12 has not ended yet.')
    expect((await close('2026-08')).json.blockers).toEqual([
      'Close 2025-12 first: months close in order.',
      'The bank account has not been reconciled for this month.',
    ])
    // December 2025: the opening bank balance.
    expect(await bankAt('2025-12-31')).toBe(5000_00)
    const dec = await reconcile({ period: '2025-12', statementBalance: '5,000.00' })
    expect(dec.json).toMatchObject({ statementDate: '2025-12-31', ledgerBalanceCents: 5000_00, differenceCents: 0 })
    const marker = await auditMarker()
    expect((await close('2025-12')).status).toBe(200)
    expect((await auditEntriesSince(marker)).map((a) => a.action)).toEqual(['ledger.period.close'])
    expect((await close('2025-12')).json.blockers).toEqual(['2025-12 is already closed.'])
    expect((await reconcile({ period: '2025-12', statementBalance: '5000' })).status).toBe(409)

    // January 2026: the two older loans were paid out on the 15th → $3,000.
    // A payout cleared on 2 February is an outstanding payment at the month end.
    const jan = await reconcile({ period: '2026-01', statementBalance: '3,500', items: [{ kind: 'outstanding_payment', description: 'payout LN-TEST-B cleared 2 Feb', amount: '500' }] })
    expect(jan.json).toMatchObject({ ledgerBalanceCents: 3000_00, differenceCents: 0 })
    // A difference blocks the close until a clean reconciliation follows.
    expect((await reconcile({ period: '2026-01', statementBalance: '2,950' })).json.differenceCents).toBe(-50_00)
    expect((await close('2026-01')).json.blockers).toEqual([expect.stringMatching(/differs by -\$50\.00/)])
    // Something dated in January and not in the ledger also blocks it.
    await prisma.contribution.create({ data: { transactionId: 'CON-JAN', memberId: 'M1', memberName: 'M1', paymentDate: new Date('2026-01-20'), monthYear: 'x', amount: 20, amountCents: BigInt(20_00), source: 'import' } }) // no method: straight to the bank
    expect((await reconcile({ period: '2026-01', statementBalance: '3,500', items: [{ kind: 'outstanding_payment', description: 'payout LN-TEST-B', amount: '500' }] })).json.differenceCents).toBe(0)
    expect(await closeBlockers(prisma, '2026-01', TODAY)).toEqual([expect.stringMatching(/1 money record\(s\) dated in 2026-01 are not in the ledger/)])
    // So does a broken ledger rule.
    vi.mocked(checkInvariants).mockResolvedValueOnce({ ok: false, problems: ['entry JE-X does not balance'] })
    expect(await closeBlockers(prisma, '2026-01', TODAY)).toContainEqual('The ledger breaks its own rules: entry JE-X does not balance.')

    // Post it, reconcile January again (now $3,020) and close it.
    await serviceDues(TODAY)
    expect((await reconcile({ period: '2026-01', statementBalance: '3,520', items: [{ kind: 'outstanding_payment', description: 'payout LN-TEST-B', amount: '500' }] })).json.differenceCents).toBe(0)
    expect((await close('2026-01')).status).toBe(200)

    // A payment dated in closed January, recorded now, posts on 1 February.
    signInAs('finance')
    const late = await contribute('15', '2026-01-25', 'Zelle')
    expect(late.status).toBe(201)
    const lateRow = await prisma.contribution.findUniqueOrThrow({ where: { transactionId: late.json.transactionId } })
    const lateEntry = await prisma.journalEntry.findUniqueOrThrow({ where: { entryNumber: lateRow.journalEntry! } })
    expect(lateEntry.effectiveDate.toISOString().slice(0, 10)).toBe('2026-02-01')
    expect(lateEntry.description).toMatch(/\(dated 2026-01-25; that month is closed\)/)
    // Replaying it (the daily job) does not post it twice.
    expect((await serviceDues(TODAY)).journalEntries).toEqual([])
    // The ledger itself refuses anything dated in a closed month.
    await expect(prisma.journalEntry.create({ data: { entryNumber: 'JE-CLOSED', effectiveDate: new Date('2026-01-31'), type: 'adjustment', description: 'x', idempotencyKey: 'x', requestHash: 'x' } })).rejects.toThrow(/closed/)

    const status = await reconciliationStatus(prisma, TODAY)
    if (!status.started) throw new Error('unreachable')
    expect(status.periods.map((p) => [p.period, p.closed, p.blockers === null ? 'later' : p.blockers.length])).toEqual([
      ['2026-08', false, 'later'], ['2026-07', false, 'later'], ['2026-06', false, 'later'], ['2026-05', false, 'later'],
      ['2026-04', false, 'later'], ['2026-03', false, 'later'], ['2026-02', false, 1], ['2026-01', true, 'later'], ['2025-12', true, 'later'],
    ])
    expect(status.periods.find((p) => p.period === '2026-01')!.reconciliation).toMatchObject({ statementBalanceCents: 3520_00, differenceCents: 0, items: [{ kind: 'outstanding_payment' }] })
    const rec = await prisma.bankReconciliation.findFirstOrThrow()
    await expect(prisma.bankReconciliation.delete({ where: { id: rec.id } })).rejects.toThrow(/cannot be changed or deleted/)
    await expect(prisma.$executeRawUnsafe('TRUNCATE "BankReconciliation"')).rejects.toThrow(/cannot be changed or deleted/)
  })

  it('is shown to anyone who can read the ledger', async () => {
    signInAs('auditor')
    const res = await callRoute('reconciliation', 'GET')
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ started: true, cutover: '2026-01-01', depositDays: 7 })
    expect(res.json.periods[0].period < new Date().toISOString().slice(0, 7)).toBe(true)
  })
})
