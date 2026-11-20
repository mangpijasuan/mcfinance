import { afterEach, expect, it, vi } from 'vitest'
import { prisma, resetDatabase, auditMarker, auditEntriesSince } from './helpers/db'
import { createBaseFixtures } from './helpers/factories'
import { signInAs, signInAsMember, TEST_IDS } from './helpers/actors'
import { callRoute } from './helpers/routes'
import { dateOnly, todayIso } from '@/lib/dates'
import { elapsedDays, membershipProgress, tenthAnniversary } from '@/modules/rewards/tenure'

afterEach(() => vi.unstubAllEnvs())

it('accrues exact whole points, handles leap anniversaries and caps after ten years', () => {
  const joinDate = dateOnly('2024-02-29')
  const account = { joinDate, eligibleDays: 0, checkpoint: joinDate, active: true }
  expect(tenthAnniversary(joinDate)).toEqual(dateOnly('2034-02-28'))
  expect(membershipProgress(account, '2024-02-29').earned).toBe(0)
  expect(membershipProgress(account, '2024-03-01').earned).toBeGreaterThan(0)
  expect(membershipProgress(account, '2034-02-27').earned).toBeLessThan(1_000_000)
  expect(membershipProgress(account, '2034-02-28')).toMatchObject({ earned: 1_000_000, nextDayPoints: 0, status: 'complete' })
  expect(membershipProgress(account, '2040-01-01').earned).toBe(1_000_000)
  expect(membershipProgress({ ...account, active: false, eligibleDays: 100 }, '2040-01-01')).toMatchObject({ eligibleDays: 100, status: 'paused', nextDayPoints: 0 })
})

it('verifies history once, isolates members and checkpoints status changes', async () => {
  await resetDatabase()
  await createBaseFixtures()
  signInAs('super_admin')
  vi.stubEnv('MC_REWARDS_ENABLED', 'true')
  const input = { action: 'enroll-membership', memberId: TEST_IDS.member, eligibleDays: 100, verification: 'Verified historical membership records' }
  const enroll = (body = input) => callRoute('rewards', 'POST', { body })
  vi.stubEnv('MC_MEMBERSHIP_ACCRUAL_ENABLED', 'false')
  expect((await enroll()).status).toBe(404)
  vi.stubEnv('MC_MEMBERSHIP_ACCRUAL_ENABLED', 'true')
  expect((await enroll({ ...input, eligibleDays: 100_000 })).status).toBe(400)
  const marker = await auditMarker()
  expect((await enroll()).status).toBe(200)
  expect((await enroll()).status).toBe(200)
  expect((await enroll({ ...input, eligibleDays: 101 })).status).toBe(400)
  expect(await prisma.membershipAccrual.count()).toBe(1)
  expect((await auditEntriesSince(marker)).filter(entry => entry.action === 'rewards.membership_enroll')).toHaveLength(1)
  signInAsMember(TEST_IDS.member)
  expect((await callRoute('portal/rewards', 'GET')).json).toMatchObject({ balance: 0, membershipAccrual: { eligibleDays: 100 } })
  signInAsMember(TEST_IDS.otherMember)
  expect((await callRoute('portal/rewards', 'GET')).json).toMatchObject({ balance: 0, membershipAccrual: null })
  expect((await enroll()).status).toBe(403)
  const prior = new Date(dateOnly(todayIso()).getTime() - 2 * 86_400_000)
  await prisma.membershipAccrual.update({ where: { memberId: TEST_IDS.member }, data: { checkpoint: prior } })
  await prisma.member.update({ where: { id: TEST_IDS.member }, data: { status: 'Inactive' } })
  const paused = await prisma.membershipAccrual.findUniqueOrThrow({ where: { memberId: TEST_IDS.member } })
  expect(paused.active).toBe(false)
  expect(paused.eligibleDays).toBe(100 + elapsedDays(prior, paused.checkpoint))
  await prisma.membershipAccrual.update({ where: { memberId: TEST_IDS.member }, data: { checkpoint: prior } })
  await prisma.member.update({ where: { id: TEST_IDS.member }, data: { status: 'Active' } })
  const resumed = await prisma.membershipAccrual.findUniqueOrThrow({ where: { memberId: TEST_IDS.member } })
  expect(resumed.active).toBe(true)
  expect(resumed.eligibleDays).toBe(paused.eligibleDays)
})
