import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { auditContext, recordAudit } from '@/modules/audit'
import { cancelPendingFor } from '@/modules/approvals'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('payments.review')
  if (auth.error) return auth.error

  const { id } = await params
  const payment = await prisma.portalPayment.findUnique({ where: { id } })
  if (!payment) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
  if (payment.status !== 'pending') {
    return NextResponse.json({ error: 'This payment has already been reviewed.' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const reviewedBy = auth.principal.email

  // Conditional update so a reject cannot overwrite a concurrent confirm.
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.portalPayment.updateMany({
      where: { id: payment.id, status: 'pending' },
      data: {
        status: 'rejected',
        rejectionReason: body.reason ? String(body.reason).slice(0, 500) : null,
        reviewedBy,
        reviewedAt: new Date(),
      },
    })
    if (claimed.count === 0) return null
    // A confirmation waiting for a second approver is now moot.
    const cancelled = await cancelPendingFor(tx, 'portal_payment', payment.id, 'Claim rejected')
    const after = await tx.portalPayment.findUniqueOrThrow({ where: { id: payment.id } })
    await recordAudit(tx, auditContext(req, auth.principal), {
      action: `payment.${payment.method}.reject`, entityType: 'portal_payment', entityId: payment.publicId,
      before: payment, after, metadata: { pendingApprovalsCancelled: cancelled },
    })
    return after
  })
  if (!updated) {
    return NextResponse.json({ error: 'This payment has already been reviewed.' }, { status: 409 })
  }

  return NextResponse.json(updated)
}
