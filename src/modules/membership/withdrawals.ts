import type { Prisma } from '@prisma/client'
import { nextPublicId } from '@/lib/publicIds'
import { OperationError } from '@/lib/operationError'
import { type AuditContext, recordAudit } from '@/modules/audit'
import type { Actors } from '@/modules/approvals/actors'

export type WithdrawalInput = {
  memberId: string
  amount: number // dollars (legacy column)
  withdrawalDate: string // ISO
  type: 'Partial' | 'Full Exit'
  reason: string | null
  processedBy: string | null
  notes: string | null
}

/** Checks that can be made before queueing for approval, and again at execution. */
export async function checkWithdrawal(db: Prisma.TransactionClient | { member: Prisma.TransactionClient['member'] }, input: WithdrawalInput) {
  const member = await db.member.findUnique({
    where: { id: input.memberId },
    select: { legalName: true, status: true, activeAsBorrower: true, activeAsCosigner: true, currentLoanBalance: true },
  })
  if (!member) throw new OperationError(404, 'Member not found')
  if (input.type === 'Full Exit' && (member.activeAsBorrower > 0 || member.activeAsCosigner > 0 || member.currentLoanBalance > 0)) {
    throw new OperationError(409, 'Member cannot fully exit while they have an active loan or co-signer obligation.')
  }
  return member
}

export async function recordWithdrawal(tx: Prisma.TransactionClient, input: WithdrawalInput, actors: Actors, ctx: AuditContext) {
  const member = await checkWithdrawal(tx, input)
  const isFullExit = input.type === 'Full Exit'
  const created = await tx.withdrawal.create({
    data: {
      withdrawalId: nextPublicId('WD'),
      memberId: input.memberId,
      memberName: member.legalName,
      amount: input.amount,
      withdrawalDate: new Date(input.withdrawalDate),
      type: input.type,
      reason: input.reason,
      processedBy: input.processedBy,
      notes: input.notes,
    },
  })
  if (isFullExit) {
    await tx.member.update({ where: { id: input.memberId }, data: { status: 'Inactive', eligible: 'NO - Inactive' } })
  }
  await recordAudit(tx, ctx, {
    action: isFullExit ? 'withdrawal.full_exit' : 'withdrawal.create',
    entityType: 'withdrawal', entityId: created.withdrawalId, after: created,
    metadata: { maker: actors.maker.id, checker: actors.checker?.id ?? null },
  })
  return created
}
