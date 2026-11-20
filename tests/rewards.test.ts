import { afterEach, expect, it, vi } from 'vitest'
import { prisma, resetDatabase, auditMarker, auditEntriesSince } from './helpers/db'
import { createBaseFixtures } from './helpers/factories'
import { signInAs, signInAsMember, TEST_IDS } from './helpers/actors'
import { callRoute } from './helpers/routes'

afterEach(() => vi.unstubAllEnvs())

it('records idempotent awards and corrections and isolates member balances', async () => {
  await resetDatabase()
  await createBaseFixtures()
  signInAs('super_admin')
  const body = { memberId: TEST_IDS.member, reference: 'event-1', reason: 'Community event', points: 50 }
  const record = (input: typeof body) => callRoute('rewards', 'POST', { body: input })
  vi.stubEnv('MC_REWARDS_ENABLED', 'false')
  expect((await record(body)).status).toBe(404)
  vi.stubEnv('MC_REWARDS_ENABLED', 'true')
  const marker = await auditMarker()
  expect((await record(body)).status).toBe(200)
  expect((await record(body)).status).toBe(200)
  expect((await record({ ...body, points: 60 })).status).toBe(400)
  expect((await record({ ...body, reference: 'correction-1', points: -20 })).status).toBe(200)
  expect((await record({ ...body, reference: 'correction-2', points: -31 })).status).toBe(400)
  expect(await prisma.rewardEntry.count()).toBe(2)
  expect((await auditEntriesSince(marker)).filter(entry => entry.action === 'rewards.record')).toHaveLength(2)
  signInAsMember(TEST_IDS.member)
  expect((await callRoute('portal/rewards', 'GET')).json).toMatchObject({ balance: 30 })
  signInAsMember(TEST_IDS.otherMember)
  expect((await callRoute('portal/rewards', 'GET')).json).toEqual({ balance: 0, entries: [] })
  expect((await record(body)).status).toBe(403)
})
