import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'
import { recordContribution, recordLoanPayment } from '@/lib/paymentActions'
import { auditContext, recordAudit } from '@/modules/audit'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const payment = await prisma.portalPayment.findUnique({ where: { id } })
  if (!payment) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
  if (payment.method !== 'zelle') {
    return NextResponse.json({ error: 'Only Zelle claims are confirmed manually.' }, { status: 400 })
  }
  if (payment.status !== 'pending') {
    return NextResponse.json({ error: 'This payment has already been reviewed.' }, { status: 409 })
  }

  const reviewedBy = String((auth.session.user as any)?.email || (auth.session.user as any)?.name || 'Admin')
  const comments = payment.zelleReference ? `Zelle: ${payment.zelleReference}` : 'Zelle payment'

  const ctx = auditContext(req, auth.session)
  const updated = await prisma.$transaction(async (tx) => {
    // Claim the claim: only one confirmation can move it out of "pending".
    // A concurrent confirm blocks on the row lock, then matches nothing.
    const claimed = await tx.portalPayment.updateMany({
      where: { id: payment.id, status: 'pending' },
      data: { status: 'completed', reviewedBy, reviewedAt: new Date() },
    })
    if (claimed.count === 0) return null

    if (payment.type === 'contribution') {
      const record = await recordContribution(tx, {
        memberId: payment.memberId,
        amount: payment.amount,
        paymentDate: new Date(),
        paymentMethod: 'Zelle',
        receivedBy: reviewedBy,
        comments,
        source: 'Zelle',
      })
      const after = await tx.portalPayment.update({
        where: { id: payment.id },
        data: { contributionId: record.id },
      })
      await recordAudit(tx, ctx, {
        action: 'payment.zelle.confirm', entityType: 'portal_payment', entityId: payment.publicId,
        before: payment, after, metadata: { contributionId: record.transactionId },
      })
      return after
    }

    if (!payment.loanId) throw new Error('Missing loanId on loan_payment PortalPayment')
    const record = await recordLoanPayment(tx, {
      loanId: payment.loanId,
      amount: payment.amount,
      paymentDate: new Date(),
      paymentMethod: 'Zelle',
      receivedBy: reviewedBy,
      comments,
      source: 'Zelle',
    })
    const after = await tx.portalPayment.update({
      where: { id: payment.id },
      data: { loanPaymentId: record.id },
    })
    await recordAudit(tx, ctx, {
      action: 'payment.zelle.confirm', entityType: 'portal_payment', entityId: payment.publicId,
      before: payment, after, metadata: { loanPaymentId: record.paymentId },
    })
    return after
  })

  if (!updated) {
    return NextResponse.json({ error: 'This payment has already been reviewed.' }, { status: 409 })
  }
  return NextResponse.json(updated)
}
