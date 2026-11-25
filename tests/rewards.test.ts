import { afterEach, expect, it, vi } from 'vitest'
import { prisma, resetDatabase, auditMarker, auditEntriesSince } from './helpers/db'
import { createBaseFixtures } from './helpers/factories'
import { signInAs, signInAsMember, staffId, TEST_IDS } from './helpers/actors'
import { callRoute } from './helpers/routes'

afterEach(() => vi.unstubAllEnvs())

const record = (input: Record<string, unknown>) => callRoute('rewards', 'POST', { body: input })
const approve = (id: string) => callRoute('approvals/[id]/approve', 'POST', { params: { id }, body: {} })
const body = { memberId: TEST_IDS.member, reference: 'event-1', reason: 'Community event', points: 50 }

/** Finance proposes; the Treasurer approves. Returns the approval request. */
async function award(input: Record<string, unknown>) {
  signInAs('finance')
  const proposed = await record(input)
  expect(proposed.status).toBe(202)
  signInAs('treasurer')
  const approved = await approve(proposed.json.approvalRequest.id)
  expect(approved.status).toBe(200)
  return approved.json
}

it('queues every entry for a second person, then records it idempotently and isolates member balances', async () => {
  await resetDatabase()
  await createBaseFixtures()
  vi.stubEnv('MC_REWARDS_ENABLED', 'false')
  signInAs('finance')
  expect((await record(body)).status).toBe(404)
  vi.stubEnv('MC_REWARDS_ENABLED', 'true')
  const marker = await auditMarker()

  // Nothing is recorded until someone else approves.
  const proposed = await record(body)
  expect(proposed.status).toBe(202)
  expect(proposed.json.approvalRequest.summary).toContain('Award 50 MC Points to MC-TEST-A')
  expect(await prisma.rewardEntry.count()).toBe(0)
  // The same entry cannot be queued twice.
  expect((await record(body)).status).toBe(409)
  // The proposer cannot approve their own entry.
  expect((await approve(proposed.json.approvalRequest.id)).status).toBe(409)
  signInAs('treasurer')
  expect((await approve(proposed.json.approvalRequest.id)).status).toBe(200)
  expect(await prisma.rewardEntry.findFirstOrThrow()).toMatchObject({ points: 50, actorId: staffId('finance'), approvedBy: staffId('treasurer') })

  // A retry of an entry that is already recorded changes nothing.
  signInAs('finance')
  expect((await record(body)).json.entry).toMatchObject({ points: 50 })
  expect((await record({ ...body, points: 60 })).status).toBe(400)

  await award({ ...body, reference: 'correction-1', points: -20 })
  expect(await prisma.rewardEntry.count()).toBe(2)
  // Refused when proposed, not after a checker's time.
  signInAs('finance')
  expect((await record({ ...body, reference: 'correction-2', points: -31 })).status).toBe(400)
  expect((await record({ ...body, memberId: 'MC-NOBODY', reference: 'x' })).status).toBe(400)
  expect((await auditEntriesSince(marker)).filter(entry => entry.action === 'rewards.record')).toHaveLength(2)

  signInAsMember(TEST_IDS.member)
  expect((await callRoute('portal/rewards', 'GET')).json).toMatchObject({ balance: 30 })
  signInAsMember(TEST_IDS.otherMember)
  expect((await callRoute('portal/rewards', 'GET')).json).toEqual({ balance: 0, entries: [] })
  expect((await record(body)).status).toBe(403)
})

it('is open to the right roles only: Finance proposes, Treasurer and Board approve, the Administrator has no access', async () => {
  await resetDatabase()
  await createBaseFixtures()
  vi.stubEnv('MC_REWARDS_ENABLED', 'true')
  const results: Record<string, [number, number]> = {}
  for (const who of ['finance', 'treasurer', 'board', 'auditor', 'administrator', 'club_officer'] as const) {
    signInAs(who)
    results[who] = [(await callRoute('rewards', 'GET', { query: `memberId=${TEST_IDS.member}` })).status, (await record({ ...body, reference: `ref-${who}` })).status]
  }
  expect(results).toEqual({
    finance: [200, 202], treasurer: [200, 403], board: [200, 403], auditor: [200, 403], administrator: [403, 403], club_officer: [200, 202],
  })
  // The Board can approve what Finance proposed.
  signInAs('finance')
  const queued = await record({ ...body, reference: 'for-board' })
  signInAs('board')
  expect((await approve(queued.json.approvalRequest.id)).status).toBe(200)
})
