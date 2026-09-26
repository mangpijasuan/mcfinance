import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'
import { recordContribution, recordLoanPayment } from '@/lib/paymentActions'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const updated = await prisma.$transaction(async (tx) => {
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
      return tx.portalPayment.update({
        where: { id: payment.id },
        data: { status: 'completed', contributionId: record.id, reviewedBy, reviewedAt: new Date() },
      })
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
    return tx.portalPayment.update({
      where: { id: payment.id },
      data: { status: 'completed', loanPaymentId: record.id, reviewedBy, reviewedAt: new Date() },
    })
  })

  return NextResponse.json(updated)
}
