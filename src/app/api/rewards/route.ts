import type { NextRequest } from 'next/server'
import { requirePermission } from '@/modules/auth'
import { readJsonObject, requiredString, badRequest } from '@/lib/http'
import { recordReward, rewardAccount, rewardsEnabled } from '@/modules/rewards'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const auth = await requirePermission('staff.manage')
  if (auth.error) return auth.error
  if (!rewardsEnabled()) return Response.json({ error: 'Rewards are unavailable.' }, { status: 404 })
  const memberId = req.nextUrl.searchParams.get('memberId')
  if (!memberId) return badRequest('Enter a member ID.')
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, legalName: true, status: true } })
  if (!member) return Response.json({ error: 'Member not found.' }, { status: 404 })
  return Response.json({ member, ...await rewardAccount(memberId) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('staff.manage')
  if (auth.error) return auth.error
  if (!rewardsEnabled()) return Response.json({ error: 'Rewards are unavailable.' }, { status: 404 })
  const body = await readJsonObject(req)
  const memberId = requiredString(body?.memberId)
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
