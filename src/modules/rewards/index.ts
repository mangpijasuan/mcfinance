import { prisma } from '@/lib/prisma'
import { auditContext, recordAudit } from '@/modules/audit'
import type { StaffPrincipal } from '@/modules/auth'
import type { NextRequest } from 'next/server'

export function rewardsEnabled() {
  return process.env.MC_REWARDS_ENABLED === 'true'
}

export async function rewardAccount(memberId: string) {
  const [total, entries] = await prisma.$transaction([
    prisma.rewardEntry.aggregate({ where: { memberId }, _sum: { points: true } }),
    prisma.rewardEntry.findMany({
      where: { memberId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
      select: { id: true, points: true, reason: true, createdAt: true },
    }),
  ], { isolationLevel: 'RepeatableRead' })
  return { balance: total._sum.points ?? 0, entries }
}

export async function recordReward(
  actor: StaffPrincipal, request: NextRequest,
  input: { memberId: string; reference: string; reason: string; points: number },
) {
  return prisma.$transaction(async tx => {
    // Serialize awards and deductions against the same member.
    const rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM "Member" WHERE id = ${input.memberId} FOR UPDATE
    `
    if (!rows[0] || rows[0].status !== 'Active') return { error: 'Select an active member.' }
    const existing = await tx.rewardEntry.findUnique({
      where: { memberId_reference: { memberId: input.memberId, reference: input.reference } },
    })
    if (existing) {
      if (existing.points !== input.points || existing.reason !== input.reason) return { error: 'This reference already has different details.' }
      return { entry: existing }
    }
    const total = await tx.rewardEntry.aggregate({ where: { memberId: input.memberId }, _sum: { points: true } })
    const nextBalance = (total._sum.points ?? 0) + input.points
    if (nextBalance < 0 || nextBalance > 1_000_000) return { error: 'The resulting points balance is outside the pilot limits.' }
    const entry = await tx.rewardEntry.create({ data: { ...input, actorId: actor.id } })
    await recordAudit(tx, auditContext(request, actor), {
      action: 'rewards.record', entityType: 'RewardEntry', entityId: entry.id, after: entry,
    })
    return { entry }
  })
}
