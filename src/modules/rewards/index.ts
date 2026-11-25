import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { OperationError } from '@/lib/operationError'
import { type AuditContext, recordAudit } from '@/modules/audit'
import type { Actors } from '@/modules/approvals/actors'

type Tx = Prisma.TransactionClient

export const REWARD_MAX_ENTRY = 1000
export const REWARD_MAX_BALANCE = 1_000_000

export type RewardInput = { memberId: string; reference: string; reason: string; points: number }

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

/**
 * Checks an entry against the pilot rules, holding the member's row so
 * awards and deductions for one member are checked one at a time. Returns
 * the entry when this exact one is already recorded (a safe retry).
 * The database enforces the same limits again (migration
 * 20261125010000_rewards_ledger_protection), so a bug here cannot break them.
 */
export async function checkReward(tx: Tx, input: RewardInput) {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM "Member" WHERE id = ${input.memberId} FOR UPDATE
  `
  if (!rows[0] || rows[0].status !== 'Active') throw new OperationError(400, 'Select an active member.')
  const existing = await tx.rewardEntry.findUnique({
    where: { memberId_reference: { memberId: input.memberId, reference: input.reference } },
  })
  if (existing) {
    if (existing.points !== input.points || existing.reason !== input.reason) {
      throw new OperationError(400, 'This reference already has different details.')
    }
    return existing
  }
  const total = await tx.rewardEntry.aggregate({ where: { memberId: input.memberId }, _sum: { points: true } })
  const nextBalance = (total._sum.points ?? 0) + input.points
  if (nextBalance < 0 || nextBalance > REWARD_MAX_BALANCE) {
    throw new OperationError(400, 'The resulting points balance is outside the pilot limits.')
  }
  return null
}

/**
 * Writes an approved entry: called when the checker approves, in the same
 * transaction. The maker is recorded as the actor, the checker as approver.
 */
export async function recordRewardEntry(tx: Tx, input: RewardInput, actors: Actors, ctx: AuditContext) {
  const existing = await checkReward(tx, input)
  if (existing) return existing
  const entry = await tx.rewardEntry.create({
    data: { ...input, actorId: actors.maker.id, approvedBy: actors.checker?.id ?? null },
  })
  await recordAudit(tx, ctx, {
    action: 'rewards.record', entityType: 'RewardEntry', entityId: entry.id, after: entry,
    metadata: { maker: actors.maker.id, checker: actors.checker?.id ?? null },
  })
  return entry
}
