import type { NextRequest } from 'next/server'
import { requirePermission } from '@/modules/auth'
import { readJsonObject, requiredString, badRequest } from '@/lib/http'
import { recordReward, rewardAccount, rewardsEnabled } from '@/modules/rewards'
import { prisma } from '@/lib/prisma'
import { enrollMembershipAccrual, membershipAccrualEnabled, readMembershipProgress } from '@/modules/rewards/membership'
import { elapsedDays } from '@/modules/rewards/tenure'
import { dateOnly, isoDateOf, todayIso } from '@/lib/dates'

export async function GET(req: NextRequest) {
  const auth = await requirePermission('staff.manage')
  if (auth.error) return auth.error
  if (!rewardsEnabled()) return Response.json({ error: 'Rewards are unavailable.' }, { status: 404 })
  const memberId = req.nextUrl.searchParams.get('memberId')
  if (!memberId) return badRequest('Enter a member ID.')
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, legalName: true, status: true, joinDate: true } })
  if (!member) return Response.json({ error: 'Member not found.' }, { status: 404 })
  const membership = membershipAccrualEnabled() ? {
    membershipAccrual: await readMembershipProgress(memberId),
    maximumHistoricalDays: elapsedDays(dateOnly(isoDateOf(member.joinDate)), dateOnly(todayIso())),
  } : {}
  return Response.json({ member, ...await rewardAccount(memberId), ...membership }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('staff.manage')
  if (auth.error) return auth.error
  if (!rewardsEnabled()) return Response.json({ error: 'Rewards are unavailable.' }, { status: 404 })
  const body = await readJsonObject(req)
  const memberId = requiredString(body?.memberId)
  if (body?.action === 'enroll-membership') {
    if (!membershipAccrualEnabled()) return Response.json({ error: 'Membership accrual is unavailable.' }, { status: 404 })
    const verification = requiredString(body.verification)
    const eligibleDays = body.eligibleDays
    if (!memberId || !verification || verification.length > 300 || !Number.isSafeInteger(eligibleDays) || eligibleDays < 0) {
      return badRequest('Provide a member ID, verified eligible days and a verification note.')
    }
    const enrollment = await enrollMembershipAccrual(auth.principal, req, memberId, eligibleDays, verification)
    if (enrollment.error) return badRequest(enrollment.error)
    return Response.json({ enrolled: true })
  }
  const reference = requiredString(body?.reference)
  const reason = requiredString(body?.reason)
  const points = body?.points
  if (!memberId || !reference || reference.length > 100 || !reason || reason.length > 300 ||
      !Number.isInteger(points) || points === 0 || Math.abs(points) > 1000) {
    return badRequest('Provide a member ID, unique activity reference, reason and whole points between -1000 and 1000, excluding zero.')
  }
  const result = await recordReward(auth.principal, req, { memberId, reference, reason, points })
  if (result.error) return badRequest(result.error)
  return Response.json(result.entry)
}
