import { afterEach, expect, it, vi } from 'vitest'
import { prisma, resetDatabase, auditMarker, auditEntriesSince } from './helpers/db'
import { createBaseFixtures } from './helpers/factories'
import { signInAs, signInAsMember, staffId, TEST_IDS } from './helpers/actors'
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

const enrollBody = { action: 'enroll-membership', memberId: TEST_IDS.member, eligibleDays: 100, verification: 'Verified historical membership records' }
const post = (body: Record<string, unknown>) => callRoute('rewards', 'POST', { body })
const approve = (id: string) => callRoute('approvals/[id]/approve', 'POST', { params: { id }, body: {} })

/** Finance proposes, the Treasurer approves; returns the approval response. */
async function proposeAndApprove(body: Record<string, unknown>) {
  signInAs('finance')
  const proposed = await post(body)
  expect(proposed.status).toBe(202)
  signInAs('treasurer')
  const approved = await approve(proposed.json.approvalRequest.id)
  expect(approved.status).toBe(200)
  signInAs('finance')
}

it('verifies history through two people, once, isolates members and checkpoints status changes', async () => {
  await resetDatabase()
  await createBaseFixtures()
  vi.stubEnv('MC_REWARDS_ENABLED', 'true')
  signInAs('finance')
  vi.stubEnv('MC_MEMBERSHIP_ACCRUAL_ENABLED', 'false')
  expect((await post(enrollBody)).status).toBe(404)
  vi.stubEnv('MC_MEMBERSHIP_ACCRUAL_ENABLED', 'true')
  expect((await post({ ...enrollBody, eligibleDays: 100_000 })).status).toBe(400)
  expect((await post({ ...enrollBody, eligibleDays: -1 })).status).toBe(400)
  expect((await post({ ...enrollBody, memberId: 'MC-NOBODY' })).status).toBe(404)
  const marker = await auditMarker()

  const proposed = await post(enrollBody)
  expect(proposed.status).toBe(202)
  expect(await prisma.membershipAccrual.count()).toBe(0)
  expect((await post(enrollBody)).status).toBe(409)
  expect((await approve(proposed.json.approvalRequest.id)).status).toBe(409) // not the proposer
  signInAs('treasurer')
  expect((await approve(proposed.json.approvalRequest.id)).status).toBe(200)
  expect(await prisma.membershipAccrual.findUniqueOrThrow({ where: { memberId: TEST_IDS.member } }))
    .toMatchObject({ eligibleDays: 100, verifiedBy: staffId('finance'), approvedBy: staffId('treasurer') })
  expect(await prisma.membershipAccrualCorrection.findFirstOrThrow()).toMatchObject({ kind: 'enroll', previousEligibleDays: null, newEligibleDays: 100, proposedBy: staffId('finance'), approvedBy: staffId('treasurer') })

  // A retry of the same verification is a no-op; a different one must be a correction.
  signInAs('finance')
  expect((await post(enrollBody)).json).toEqual({ enrolled: true })
  expect((await post({ ...enrollBody, eligibleDays: 101 })).status).toBe(400)
  expect(await prisma.membershipAccrual.count()).toBe(1)
  expect((await auditEntriesSince(marker)).filter(entry => entry.action === 'rewards.membership_enroll')).toHaveLength(1)

  signInAsMember(TEST_IDS.member)
  expect((await callRoute('portal/rewards', 'GET')).json).toMatchObject({ balance: 0, membershipAccrual: { eligibleDays: 100 } })
  signInAsMember(TEST_IDS.otherMember)
  expect((await callRoute('portal/rewards', 'GET')).json).toMatchObject({ balance: 0, membershipAccrual: null })
  expect((await post(enrollBody)).status).toBe(403)

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

it('corrects verified days and the join date only through two people, with a permanent history', async () => {
  await resetDatabase()
  await createBaseFixtures()
  vi.stubEnv('MC_REWARDS_ENABLED', 'true')
  vi.stubEnv('MC_MEMBERSHIP_ACCRUAL_ENABLED', 'true')
  signInAs('finance')
  const correct = (over: Record<string, unknown> = {}) => post({
    action: 'correct-membership', memberId: TEST_IDS.member, adjustmentDays: 5, expectedEligibleDays: 100, syncJoinDate: false, reason: 'Found the 2019 attendance sheet', ...over,
  })
  // Nothing to correct until the history is verified.
  expect((await correct()).status).toBe(400)
  await proposeAndApprove(enrollBody)
  const member = await prisma.member.findUniqueOrThrow({ where: { id: TEST_IDS.member } })
  const elapsed = elapsedDays(dateOnly(member.joinDate.toISOString().slice(0, 10)), dateOnly(todayIso()))

  // Refused when proposed: malformed, out of range, nothing to change, or based on stale days.
  expect((await correct({ reason: '' })).status).toBe(400)
  expect((await correct({ adjustmentDays: 1.5 })).status).toBe(400)
  expect((await correct({ syncJoinDate: 'yes' })).status).toBe(400)
  expect((await correct({ adjustmentDays: -101 })).status).toBe(400)
  expect((await correct({ adjustmentDays: elapsed })).status).toBe(400)
  expect((await correct({ adjustmentDays: 0 })).status).toBe(400)
  expect((await correct({ expectedEligibleDays: 99 })).status).toBe(409)
  expect((await correct({ memberId: 'MC-NOBODY' })).status).toBe(404)

  // What staff see: stored values, no drift yet.
  const view = (await callRoute('rewards', 'GET', { query: `memberId=${TEST_IDS.member}` })).json.membershipAudit
  expect(view).toMatchObject({ stored: { eligibleDays: 100 }, joinDateDrift: false })

  const marker = await auditMarker()
  const queued = await correct()
  expect(queued.status).toBe(202)
  expect((await correct()).status).toBe(409) // already waiting
  expect((await prisma.membershipAccrual.findUniqueOrThrow({ where: { memberId: TEST_IDS.member } })).eligibleDays).toBe(100)
  // The stored days change before it is approved: the approval is refused and the request stays pending.
  await prisma.membershipAccrual.update({ where: { memberId: TEST_IDS.member }, data: { eligibleDays: 101 } })
  signInAs('treasurer')
  expect((await approve(queued.json.approvalRequest.id)).status).toBe(409)
  await prisma.membershipAccrual.update({ where: { memberId: TEST_IDS.member }, data: { eligibleDays: 100 } })
  expect((await approve(queued.json.approvalRequest.id)).status).toBe(200)
  expect(await prisma.membershipAccrual.findUniqueOrThrow({ where: { memberId: TEST_IDS.member } })).toMatchObject({ eligibleDays: 105 })
  expect(await prisma.membershipAccrualCorrection.findFirstOrThrow({ where: { kind: 'adjust' } }))
    .toMatchObject({ previousEligibleDays: 100, newEligibleDays: 105, reason: 'Found the 2019 attendance sheet', proposedBy: staffId('finance'), approvedBy: staffId('treasurer') })
  const audited = (await auditEntriesSince(marker)).filter(entry => entry.action === 'rewards.membership_correct')
  expect(audited).toHaveLength(1)

  // The member record's join date was edited afterwards: the drift is shown and can be adopted.
  signInAs('finance')
  const earlier = new Date(member.joinDate.getTime() - 3 * 86_400_000)
  await prisma.member.update({ where: { id: TEST_IDS.member }, data: { joinDate: earlier } })
  const drift = (await callRoute('rewards', 'GET', { query: `memberId=${TEST_IDS.member}` })).json.membershipAudit
  expect(drift.joinDateDrift).toEqual({ memberRecord: earlier.toISOString().slice(0, 10) })
  await proposeAndApprove({
    action: 'correct-membership', memberId: TEST_IDS.member, adjustmentDays: 3, expectedEligibleDays: 105, syncJoinDate: true, reason: 'Join date corrected to the signed application',
  })
  expect(await prisma.membershipAccrual.findUniqueOrThrow({ where: { memberId: TEST_IDS.member } })).toMatchObject({ eligibleDays: 108, joinDate: dateOnly(earlier.toISOString().slice(0, 10)) })
  expect(await prisma.membershipAccrualCorrection.findFirstOrThrow({ where: { kind: 'adjust_and_sync' } })).toMatchObject({ previousEligibleDays: 105, newEligibleDays: 108 })
  // Only syncing the join date, no day change.
  const later = new Date(earlier.getTime() + 2 * 86_400_000)
  await prisma.member.update({ where: { id: TEST_IDS.member }, data: { joinDate: later } })
  await proposeAndApprove({ action: 'correct-membership', memberId: TEST_IDS.member, adjustmentDays: 0, expectedEligibleDays: 108, syncJoinDate: true, reason: 'Join date moved by the board' })
  expect(await prisma.membershipAccrualCorrection.findFirstOrThrow({ where: { kind: 'sync_join_date' } })).toMatchObject({ newEligibleDays: 108 })
  // A join date that would leave more verified days than have elapsed cannot be adopted.
  await prisma.member.update({ where: { id: TEST_IDS.member }, data: { joinDate: dateOnly(todayIso()) } })
  expect((await post({ action: 'correct-membership', memberId: TEST_IDS.member, adjustmentDays: 0, expectedEligibleDays: 108, syncJoinDate: true, reason: 'Too recent' })).status).toBe(400)
  expect((await callRoute('rewards', 'GET', { query: `memberId=${TEST_IDS.member}` })).json.membershipAudit.history).toHaveLength(4)
  // Not for the Treasurer to propose, nor for members.
  signInAs('treasurer')
  expect((await correct({ expectedEligibleDays: 108 })).status).toBe(403)
  signInAsMember(TEST_IDS.member)
  expect((await correct()).status).toBe(403)
})

it('is protected by the database too', async () => {
  await resetDatabase()
  await createBaseFixtures()
  vi.stubEnv('MC_REWARDS_ENABLED', 'true')
  vi.stubEnv('MC_MEMBERSHIP_ACCRUAL_ENABLED', 'true')
  signInAs('finance')
  await proposeAndApprove(enrollBody)
  const id = TEST_IDS.member
  await expect(prisma.membershipAccrual.delete({ where: { memberId: id } })).rejects.toThrow(/cannot be removed/)
  await expect(prisma.$executeRawUnsafe('TRUNCATE "MembershipAccrual" CASCADE')).rejects.toThrow(/cannot be removed/)
  await expect(prisma.membershipAccrual.update({ where: { memberId: id }, data: { eligibleDays: 1_000_000 } })).rejects.toThrow()
  await expect(prisma.membershipAccrual.update({ where: { memberId: id }, data: { approvedBy: staffId('finance') } })).rejects.toThrow()
  const history = await prisma.membershipAccrualCorrection.findFirstOrThrow()
  await expect(prisma.membershipAccrualCorrection.update({ where: { id: history.id }, data: { reason: 'changed' } })).rejects.toThrow(/append-only/)
  await expect(prisma.membershipAccrualCorrection.delete({ where: { id: history.id } })).rejects.toThrow(/append-only/)
  await expect(prisma.$executeRawUnsafe('TRUNCATE "MembershipAccrualCorrection"')).rejects.toThrow(/append-only/)
  const base = { memberId: id, kind: 'adjust', newEligibleDays: 1, newJoinDate: new Date('2020-01-01'), reason: 'x', proposedBy: staffId('finance'), approvedBy: staffId('treasurer') }
  await expect(prisma.membershipAccrualCorrection.create({ data: { ...base, approvedBy: staffId('finance') } })).rejects.toThrow()
  await expect(prisma.membershipAccrualCorrection.create({ data: { ...base, kind: 'other' } })).rejects.toThrow()
  await expect(prisma.membershipAccrualCorrection.create({ data: { ...base, newEligibleDays: -1 } })).rejects.toThrow()
  await expect(prisma.membershipAccrualCorrection.create({ data: { ...base, reason: '  ' } })).rejects.toThrow()
  await expect(prisma.membershipAccrualCorrection.create({ data: { ...base, proposedBy: 'nobody' } })).rejects.toThrow()
})
