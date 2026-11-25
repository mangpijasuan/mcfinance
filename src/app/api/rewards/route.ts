import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requirePermission } from '@/modules/auth'
import { readJsonObject, requiredString, badRequest } from '@/lib/http'
import { checkReward, REWARD_MAX_ENTRY, rewardAccount, rewardsEnabled } from '@/modules/rewards'
import { submitOrExecute } from '@/modules/approvals'
import { operationErrorResponse } from '@/lib/operationError'
import { prisma } from '@/lib/prisma'
import { checkCorrection, checkEnrollment, membershipAccrualEnabled, readMembershipAudit, readMembershipProgress } from '@/modules/rewards/membership'
import { elapsedDays } from '@/modules/rewards/tenure'
import { dateOnly, isoDateOf, todayIso } from '@/lib/dates'

export async function GET(req: NextRequest) {
  const auth = await requirePermission('rewards.read')
  if (auth.error) return auth.error
  if (!rewardsEnabled()) return Response.json({ error: 'Rewards are unavailable.' }, { status: 404 })
  const memberId = req.nextUrl.searchParams.get('memberId')
  if (!memberId) return badRequest('Enter a member ID.')
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, legalName: true, status: true, joinDate: true } })
  if (!member) return Response.json({ error: 'Member not found.' }, { status: 404 })
  const membership = membershipAccrualEnabled() ? {
    membershipAccrual: await readMembershipProgress(memberId),
    membershipAudit: await readMembershipAudit(memberId),
    maximumHistoricalDays: elapsedDays(dateOnly(isoDateOf(member.joinDate)), dateOnly(todayIso())),
  } : {}
  return Response.json({ member, ...await rewardAccount(memberId), ...membership }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('rewards.record')
  if (auth.error) return auth.error
  if (!rewardsEnabled()) return Response.json({ error: 'Rewards are unavailable.' }, { status: 404 })
  const body = await readJsonObject(req)
  const memberId = requiredString(body?.memberId)
  if (body?.action === 'enroll-membership' || body?.action === 'correct-membership') {
    if (!membershipAccrualEnabled()) return Response.json({ error: 'Membership accrual is unavailable.' }, { status: 404 })
    if (!memberId) return badRequest('Provide a member ID.')
    try {
      if (body.action === 'enroll-membership') {
        const verification = requiredString(body.verification)
        const eligibleDays = body.eligibleDays
        if (!verification || verification.length > 300 || !Number.isSafeInteger(eligibleDays) || eligibleDays < 0) {
          return badRequest('Provide a member ID, verified eligible days and a verification note.')
        }
        const input = { memberId, eligibleDays, verification }
        if ((await prisma.$transaction((tx) => checkEnrollment(tx, input))).existing) return NextResponse.json({ enrolled: true })
        const out = await submitOrExecute({
          action: 'rewards.membership.enroll', principal: auth.principal, req, amountCents: null,
          entityType: 'membership_accrual', entityId: memberId,
          summary: `Verify ${eligibleDays} active membership days for ${memberId}. Evidence: ${verification}`,
          payload: input,
        })
        return NextResponse.json({ approvalRequest: 'queued' in out ? out.queued : undefined }, { status: 202 })
      }
      const reason = requiredString(body.reason)
      const { adjustmentDays, expectedEligibleDays } = body
      if (!reason || reason.length > 300 || !Number.isSafeInteger(adjustmentDays) || !Number.isSafeInteger(expectedEligibleDays) || typeof body.syncJoinDate !== 'boolean') {
        return badRequest('Provide the member, the days to add or take away, the days now stored, whether to adopt the member record’s join date, and the reason with its evidence.')
      }
      const input = { memberId, adjustmentDays, expectedEligibleDays, syncJoinDate: body.syncJoinDate, reason }
      await prisma.$transaction((tx) => checkCorrection(tx, input))
      const out = await submitOrExecute({
        action: 'rewards.membership.correct', principal: auth.principal, req, amountCents: null,
        entityType: 'membership_accrual', entityId: memberId,
        summary: `Correct membership history of ${memberId}: ${adjustmentDays >= 0 ? '+' : ''}${adjustmentDays} days${input.syncJoinDate ? ', adopt the member record’s join date' : ''}. Reason: ${reason}`,
        payload: input,
      })
      return NextResponse.json({ approvalRequest: 'queued' in out ? out.queued : undefined }, { status: 202 })
    } catch (err) {
      const res = operationErrorResponse(err)
      if (res) return res
      throw err
    }
  }
  const reference = requiredString(body?.reference)
  const reason = requiredString(body?.reason)
  const points = body?.points
  if (!memberId || !reference || reference.length > 100 || !reason || reason.length > 300 ||
      !Number.isInteger(points) || points === 0 || Math.abs(points) > REWARD_MAX_ENTRY) {
    return badRequest(`Provide a member ID, unique activity reference, reason and whole points between -${REWARD_MAX_ENTRY} and ${REWARD_MAX_ENTRY}, excluding zero.`)
  }
  const input = { memberId, reference, reason, points }
  try {
    // Refused now, rather than after a checker's time: unknown or inactive member, changed details, balance limits.
    const already = await prisma.$transaction((tx) => checkReward(tx, input))
    if (already) return NextResponse.json({ entry: already })
    // Every entry needs a second person (maker/checker): this queues it.
    const out = await submitOrExecute({
      action: 'rewards.record', principal: auth.principal, req, amountCents: null,
      entityType: 'reward', entityId: `${memberId}:${reference}`,
      summary: `${points > 0 ? 'Award' : 'Deduct'} ${Math.abs(points)} MC Points ${points > 0 ? 'to' : 'from'} ${memberId} (${reference}). Reason: ${reason}`,
      payload: input,
    })
    if ('queued' in out) return NextResponse.json({ approvalRequest: out.queued }, { status: 202 })
    return NextResponse.json({ entry: out.result })
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
