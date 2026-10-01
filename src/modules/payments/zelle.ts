import type { Prisma } from '@prisma/client'
import { recordContribution, recordLoanPayment } from '@/lib/paymentActions'
import { OperationError } from '@/lib/operationError'
import { type AuditContext, recordAudit } from '@/modules/audit'
import type { Actors } from '@/modules/approvals/actors'

/**
 * Confirm a member's Zelle claim: record the contribution or loan payment
 * it describes. Only one confirmation can move a claim out of "pending"
 * (a concurrent one blocks on the row lock, then matches nothing).
 */
export async function confirmZelleClaim(tx: Prisma.TransactionClient, paymentId: string, actors: Actors, ctx: AuditContext) {
  const payment = await tx.portalPayment.findUnique({ where: { id: paymentId } })
  if (!payment) throw new OperationError(404, 'Payment not found.')
  if (payment.method !== 'zelle') throw new OperationError(400, 'Only Zelle claims are confirmed manually.')

  const reviewedBy = actors.maker.email
  const claimed = await tx.portalPayment.updateMany({
    where: { id: payment.id, status: 'pending' },
    data: { status: 'completed', reviewedBy, reviewedAt: new Date() },
  })
  if (claimed.count === 0) throw new OperationError(409, 'This payment has already been reviewed.')

  const common = {
    amount: payment.amount,
    paymentDate: new Date(),
    paymentMethod: 'Zelle',
    receivedBy: reviewedBy,
    comments: payment.zelleReference ? `Zelle: ${payment.zelleReference}` : 'Zelle payment',
    source: 'Zelle',
  }
  let after
  let recorded: Record<string, string>
  if (payment.type === 'contribution') {
    const record = await recordContribution(tx, { memberId: payment.memberId, ...common })
    after = await tx.portalPayment.update({ where: { id: payment.id }, data: { contributionId: record.id } })
    recorded = { contributionId: record.transactionId }
  } else {
    if (!payment.loanId) throw new Error('Missing loanId on loan_payment PortalPayment')
    const record = await recordLoanPayment(tx, { loanId: payment.loanId, ...common })
    after = await tx.portalPayment.update({ where: { id: payment.id }, data: { loanPaymentId: record.id } })
    recorded = { loanPaymentId: record.paymentId }
  }
  await recordAudit(tx, ctx, {
    action: 'payment.zelle.confirm', entityType: 'portal_payment', entityId: payment.publicId,
    before: payment, after,
    metadata: { ...recorded, maker: actors.maker.id, checker: actors.checker?.id ?? null },
  })
  return after
}
