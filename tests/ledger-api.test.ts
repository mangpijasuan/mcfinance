// Recording the accountant's approval, and reading the books over the API.
import { beforeEach, describe, expect, it } from 'vitest'
import { signInAs, staffId } from './helpers/actors'
import { auditEntriesSince, auditMarker, prisma, resetDatabase } from './helpers/db'
import { createBaseFixtures } from './helpers/factories'
import { callRoute } from './helpers/routes'
import { parseDollars as $ } from '@/lib/money'
import { postEntry } from '@/modules/accounting/ledger'

beforeEach(async () => {
  await resetDatabase()
  await createBaseFixtures()
})

const NOTE = 'Jane Example CPA, letter of 2026-10-15'

describe('approving the chart of accounts', () => {
  it('needs a note and an explicit confirmation', async () => {
    signInAs('treasurer')
    expect((await callRoute('ledger/accounts/approve', 'POST', { body: { note: 'ok', confirm: true } })).status).toBe(400)
    expect((await callRoute('ledger/accounts/approve', 'POST', { body: { note: NOTE } })).status).toBe(400)
    expect(await prisma.ledgerAccount.count({ where: { status: 'approved' } })).toBe(0)
  })

  it('the Treasurer records it once; it is audited; posting then works', async () => {
    const marker = await auditMarker()
    signInAs('treasurer')
    const res = await callRoute('ledger/accounts/approve', 'POST', { body: { note: NOTE, confirm: true } })
    expect(res.json).toEqual({ approved: 18 })
    expect((await callRoute('ledger/accounts/approve', 'POST', { body: { note: NOTE, confirm: true } })).status).toBe(409)

    const account = await prisma.ledgerAccount.findUniqueOrThrow({ where: { code: '2000' } })
    expect(account).toMatchObject({ status: 'approved', approvedBy: staffId('treasurer'), approvalNote: NOTE })
    const [entry] = await auditEntriesSince(marker)
    expect(entry).toMatchObject({ action: 'ledger.accounts.approve', actorId: staffId('treasurer') })
    expect((entry.metadata as any).approved).toBe(18)

    await prisma.$transaction((tx) => postEntry(tx, {
      effectiveDate: '2026-10-16', type: 'deposit', description: 'first posting', idempotencyKey: 'first',
      lines: [{ account: '1000', debit: $('100') }, { account: '3000', credit: $('100') }],
    }))
    signInAs('auditor')
    const tb = await callRoute('ledger/trial-balance', 'GET')
    expect(tb.json).toMatchObject({ balanced: true, totalDebit: 10000, totalCredit: 10000 })
    expect((await callRoute('ledger/trial-balance', 'GET', { query: 'asOf=2026-10-15' })).json.totalDebit).toBe(0)
    expect((await callRoute('ledger/trial-balance', 'GET', { query: 'asOf=yesterday' })).status).toBe(400)
    const journal = await callRoute('ledger/entries', 'GET')
    expect(journal.json.entries[0]).toMatchObject({ description: 'first posting', lines: [{ account: '1000', debit: 10000 }, { account: '3000', credit: 10000 }] })
    expect((await callRoute('ledger/invariants', 'GET')).json).toEqual({ ok: true, problems: [] })
  })

  it('the transitional Club Officer cannot approve the chart', async () => {
    signInAs('admin')
    expect((await callRoute('ledger/accounts/approve', 'POST', { body: { note: NOTE, confirm: true } })).status).toBe(403)
    expect((await callRoute('ledger/accounts', 'GET')).status).toBe(200)
  })
})
