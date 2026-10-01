// Contributions as obligations and allocations (docs/architecture/04 §1):
// monthly dues per member, payments covering the oldest month first with
// numbered receipts, the daily dues job, arrears, corrections by reversal
// with a checker, plan changes, and ledger postings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signInAs, signInAsMember, staffId } from './helpers/actors'
import { prisma, resetDatabase } from './helpers/db'
import { createBaseFixtures, createMember } from './helpers/factories'
import { callRoute } from './helpers/routes'
import { approveAccounts, checkInvariants } from '@/modules/accounting/ledger'
import { checkReversal, onMemberStatusChange, recordContribution, serviceDues, syncMemberDues } from '@/modules/contributions'

const M = 'MC-DUES'

async function setToday(date: string) {
  vi.setSystemTime(new Date(`${date}T18:00:00Z`))
  await prisma.staffSession.updateMany({ data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 12 * 3600_000) } })
}

async function contribute(amount: string, extra: Record<string, unknown> = {}, memberId = M) {
  signInAs('finance')
  return callRoute('contributions', 'POST', { body: { memberId, amount, paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', ...extra } })
}

const dues = async (memberId = M) => {
  signInAs('treasurer')
  return (await callRoute('members/[id]/dues', 'GET', { params: { id: memberId } })).json
}
const member = (id = M) => prisma.member.findUniqueOrThrow({ where: { id } })
const obligations = async (id = M) => (await prisma.duesObligation.findMany({ where: { memberId: id }, orderBy: { period: 'asc' } })).map((o) => o.period)
const approve = (id: string) => callRoute('approvals/[id]/approve', 'POST', { params: { id }, body: {} })

async function approveChart() {
  const codes = (await prisma.ledgerAccount.findMany({ select: { code: true } })).map((a) => a.code)
  await prisma.$transaction((tx) => approveAccounts(tx, { codes, approvedBy: staffId('treasurer'), note: 'test chart approval' }))
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-03-20T18:00:00Z'))
  await resetDatabase()
  await createBaseFixtures()
  await createMember(M, { joinDate: new Date('2025-06-01') }) // tracked from 2026-01
})
afterEach(() => vi.useRealTimers())

describe('recording a payment', () => {
  it('issues a numbered receipt and covers the oldest month first', async () => {
    const first = await contribute('50')
    expect(first.status).toBe(201)
    expect(first.json.receiptNumber).toMatch(/^RC-2026-\d{6}$/)
    expect(first.json.receiptCovers).toBe('Dues Jan – Mar 2026 (Mar 2026 in part)')
    expect(await obligations()).toEqual(['2026-01', '2026-02', '2026-03'])
    expect((await member()).thisMonth).toBe('NOT PAID')

    const second = await contribute('30')
    expect(second.json.receiptCovers).toBe('Dues Mar 2026; $20.00 held as credit toward the next months')
    expect(await member()).toMatchObject({ thisMonth: 'PAID', contributions2026: 80, overallContributions: 80 })
    expect(await dues()).toMatchObject({ coveredThrough: '2026-04', creditCents: 2000, arrearsCents: 0, monthlyCents: 2000 })

    // The receipt, for staff and for the member (only their own).
    const receipt = await callRoute('contributions/[id]', 'GET', { params: { id: second.json.transactionId } })
    expect(receipt.json).toMatchObject({ receiptNumber: second.json.receiptNumber, amountCents: 3000, covers: second.json.receiptCovers })
    signInAsMember(M)
    expect((await callRoute('contributions/[id]', 'GET', { params: { id: second.json.transactionId } })).status).toBe(200)
    expect((await callRoute('portal/dues', 'GET')).json).toMatchObject({ coveredThrough: '2026-04', currentPaid: true })
    signInAsMember('MC-TEST-A')
    expect((await callRoute('contributions/[id]', 'GET', { params: { id: second.json.transactionId } })).status).toBe(404)
  })

  it('takes whole cents only, and keeps voluntary money out of dues', async () => {
    expect((await contribute('10.005')).status).toBe(400)
    expect((await contribute('10', { category: 'gift' })).status).toBe(400)
    const voluntary = await contribute('100', { category: 'voluntary' })
    expect(voluntary.json.receiptCovers).toBe('Voluntary contribution (not applied to dues)')
    expect(await member()).toMatchObject({ thisMonth: 'NOT PAID', overallContributions: 100 })
    expect((await dues()).arrearsCents).toBe(4000)
  })
})

describe('the daily dues job', () => {
  it('starts each month unpaid unless prepaid, and is safe to repeat', async () => {
    await contribute('80') // Jan–Mar plus April in advance
    await setToday('2026-04-02')
    const april = await serviceDues()
    expect(april.errors).toEqual([])
    expect((await member()).thisMonth).toBe('PAID')
    expect((await serviceDues()).obligationsCreated).toBe(0)

    await setToday('2026-05-01')
    const may = await serviceDues()
    expect(may.changed).toContainEqual({ memberId: M, from: 'PAID', to: 'NOT PAID' })
    expect(await obligations()).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'])
  })

  it('bills nothing while a member is inactive, and does not bill the gap on return', async () => {
    await contribute('60')
    signInAs('admin')
    expect((await callRoute('members/[id]', 'PATCH', { params: { id: M }, body: { status: 'Inactive' } })).status).toBe(200)
    await setToday('2026-06-10')
    await serviceDues()
    expect(await obligations()).toEqual(['2026-01', '2026-02', '2026-03'])
    signInAs('admin')
    await callRoute('members/[id]', 'PATCH', { params: { id: M }, body: { status: 'Active' } })
    expect(await obligations()).toEqual(['2026-01', '2026-02', '2026-03', '2026-06'])
    expect((await callRoute('members/[id]', 'PATCH', { params: { id: M }, body: { status: 'Gone' } })).status).toBe(400)
  })

  it('a member leaving before the job ever ran still owes the months they were active', async () => {
    signInAs('admin')
    await callRoute('members/[id]', 'PATCH', { params: { id: M }, body: { status: 'Inactive' } })
    expect(await obligations()).toEqual(['2026-01', '2026-02', '2026-03'])
    expect((await member()).duesThrough).toBe('2026-03')
  })

  it('reports arrears by age and collection by month', async () => {
    await createMember('MC-ONTIME', { joinDate: new Date('2025-06-01') })
    await contribute('60', {}, 'MC-ONTIME')
    await contribute('20') // M pays January only
    await serviceDues()
    signInAs('auditor')
    const report = (await callRoute('dues', 'GET')).json
    expect(report.arrears.find((a: any) => a.memberId === M)).toMatchObject({ months: 1, oldest: '2026-02', amountCents: 2000, bucket: '1 month' })
    expect(report.arrears.map((a: any) => a.memberId)).not.toContain('MC-ONTIME')
    const march = report.periods.find((p: any) => p.period === '2026-03')
    expect(march).toMatchObject({ paidInFull: 1 })
    expect(march.billed).toBeGreaterThanOrEqual(2)
  })
})

describe('corrections', () => {
  it('a reversal needs a checker; the payment stays on record but stops counting', async () => {
    await approveChart()
    const paid = await contribute('40')
    const { journalEntry } = await prisma.contribution.findUniqueOrThrow({ where: { transactionId: paid.json.transactionId } })
    const lines = await prisma.journalLine.findMany({ where: { entry: { entryNumber: journalEntry! } }, orderBy: { lineNo: 'asc' } })
    expect(lines.map((l) => [l.accountCode, Number(l.debitCents), Number(l.creditCents), l.memberId])).toEqual([['1030', 4000, 0, null], ['2000', 0, 4000, M]])

    signInAs('finance')
    const queued = await callRoute('contributions/[id]/reverse', 'POST', { params: { id: paid.json.transactionId }, body: { reason: 'wrong member' } })
    expect(queued.status).toBe(202)
    const { id } = queued.json.approvalRequest
    expect((await approve(id)).json.code).toBe('maker_is_checker')
    signInAs('treasurer')
    expect((await approve(id)).json).toMatchObject({ status: 'approved', resultRef: paid.json.transactionId })

    const after = await prisma.contribution.findUniqueOrThrow({ where: { transactionId: paid.json.transactionId } })
    expect(after).toMatchObject({ reversedBy: staffId('finance'), reversalReason: 'wrong member' })
    expect(after.reversalEntry).toMatch(/^JE-/)
    expect(await member()).toMatchObject({ overallContributions: 0, thisMonth: 'NOT PAID' })
    expect((await dues()).arrearsCents).toBe(4000)
    signInAs('finance')
    expect((await callRoute('contributions', 'GET')).json.totalAmount).toBe(0)
    expect((await callRoute('contributions/[id]/reverse', 'POST', { params: { id: paid.json.transactionId }, body: { reason: 'again' } })).status).toBe(409)
    expect(await checkInvariants(prisma)).toEqual({ ok: true, problems: [] })
  })

  it('the database refuses edits and deletes of recorded money', async () => {
    const paid = await contribute('20')
    const where = { transactionId: paid.json.transactionId }
    await expect(prisma.contribution.update({ where, data: { amount: 2000 } })).rejects.toThrow(/record a reversal/)
    await expect(prisma.contribution.delete({ where })).rejects.toThrow(/cannot be deleted/)
    await expect(prisma.contribution.update({ where, data: { receiptNumber: 'RC-FAKE' } })).rejects.toThrow(/record a reversal/)
    expect((await prisma.contribution.update({ where, data: { comments: 'paid at the March meeting' } })).comments).toBe('paid at the March meeting')
    const [first] = await prisma.duesObligation.findMany({ where: { memberId: M } })
    await expect(prisma.duesObligation.update({ where: { id: first.id }, data: { amountCents: BigInt(1) } })).rejects.toThrow(/cannot be changed/)
    await expect(prisma.duesPlan.deleteMany({ where: { memberId: M } })).rejects.toThrow(/cannot be changed/)
  })
})

describe('dues plans', () => {
  it('change only from a month not yet billed', async () => {
    await syncMemberDues(prisma as never, M)
    signInAs('treasurer')
    const early = await callRoute('members/[id]/dues', 'POST', { params: { id: M }, body: { amount: '10', startPeriod: '2026-03' } })
    expect(early.status).toBe(409)
    const ok = await callRoute('members/[id]/dues', 'POST', { params: { id: M }, body: { amount: '10', startPeriod: '2026-04', note: 'hardship' } })
    expect(ok.status).toBe(201)
    expect((await callRoute('members/[id]/dues', 'POST', { params: { id: M }, body: { amount: '12', startPeriod: '2026-04' } })).status).toBe(409)
    expect((await callRoute('members/[id]/dues', 'POST', { params: { id: M }, body: { amount: '-1', startPeriod: '2026-05' } })).status).toBe(400)
    expect((await callRoute('members/[id]/dues', 'POST', { params: { id: M }, body: { amount: '10', startPeriod: 'April' } })).status).toBe(400)
    await setToday('2026-04-01')
    await serviceDues()
    const april = await prisma.duesObligation.findUniqueOrThrow({ where: { memberId_period: { memberId: M, period: '2026-04' } } })
    expect(Number(april.amountCents)).toBe(1000)
  })
})

describe('ledger', () => {
  it('posts receipted payments once the chart is approved; older rows wait for M4', async () => {
    await prisma.contribution.create({
      data: { transactionId: 'CON-LEGACY', memberId: M, memberName: 'x', paymentDate: new Date('2026-01-05'), monthYear: 'Jan-2026', amount: 20, amountCents: BigInt(2000), source: 'import' },
    })
    const paid = await contribute('20')
    expect(paid.json.journalEntries).toEqual([])
    expect(await member()).toMatchObject({ overallContributions: 40 }) // the legacy row counts towards dues and totals
    await approveChart()
    const run = await serviceDues()
    expect(run.journalEntries).toHaveLength(1)
    expect((await prisma.contribution.findUniqueOrThrow({ where: { transactionId: 'CON-LEGACY' } })).journalEntry).toBeNull()
    expect((await serviceDues()).journalEntries).toEqual([])
  })
})

describe('edge cases', () => {
  const record = (params: Partial<Parameters<typeof recordContribution>[1]>) => prisma.$transaction((tx) => recordContribution(tx, {
    memberId: M, amount: 20, paymentDate: new Date('2026-03-20'), source: 'test', ...params,
  }))

  it('refuses bad amounts and unknown members, and dates auto-pay on the 15th', async () => {
    await expect(record({ amount: 10.005 })).rejects.toMatchObject({ status: 400 })
    await expect(record({ amount: 0 })).rejects.toMatchObject({ status: 400 })
    await expect(record({ memberId: 'MC-NOBODY' })).rejects.toMatchObject({ status: 404 })
    await expect(prisma.$transaction((tx) => syncMemberDues(tx, 'MC-NOBODY'))).rejects.toMatchObject({ status: 404 })
    const autoPay = await record({ paymentMethod: 'Auto-pay', paymentDate: new Date('2026-03-03T12:00:00') })
    expect(autoPay.paymentDate.getDate()).toBe(15)
    expect((await record({})).paymentMethod).toBeNull()
  })

  it('a payment when nothing is owed is all credit', async () => {
    await contribute('60')
    expect((await contribute('20')).json.receiptCovers).toBe('$20.00 held as credit toward the next months')
  })

  it('a $0 plan bills nothing from its month', async () => {
    signInAs('treasurer')
    await syncMemberDues(prisma as never, M)
    await callRoute('members/[id]/dues', 'POST', { params: { id: M }, body: { amount: '0', startPeriod: '2026-04' } })
    await setToday('2026-05-02')
    await serviceDues()
    expect(await obligations()).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('reversal checks, status changes between other statuses, and job errors', async () => {
    signInAs('finance')
    expect((await callRoute('contributions/[id]/reverse', 'POST', { params: { id: 'CON-NONE' }, body: { reason: 'x' } })).status).toBe(404)
    await expect(checkReversal(prisma, { transactionId: (await contribute('20')).json.transactionId, reason: '  ' })).rejects.toMatchObject({ status: 400 })

    await prisma.member.update({ where: { id: M }, data: { status: 'Inactive' } })
    await prisma.$transaction((tx) => onMemberStatusChange(tx, M, 'Inactive', 'Deceased'))
    expect(await obligations()).toEqual(['2026-01', '2026-02', '2026-03']) // from the payment above; nothing new

    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce('plain failure')
    const report = await serviceDues()
    spy.mockRestore()
    expect(report.errors.slice(0, 2).map((e) => e.error)).toEqual(['boom', 'plain failure'])
  })
})
