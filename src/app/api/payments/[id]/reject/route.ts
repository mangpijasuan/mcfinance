import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const payment = await prisma.portalPayment.findUnique({ where: { id } })
  if (!payment) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
  if (payment.status !== 'pending') {
    return NextResponse.json({ error: 'This payment has already been reviewed.' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const reviewedBy = String((auth.session.user as any)?.email || (auth.session.user as any)?.name || 'Admin')

  const updated = await prisma.portalPayment.update({
    where: { id: payment.id },
    data: {
      status: 'rejected',
      rejectionReason: body.reason ? String(body.reason).slice(0, 500) : null,
      reviewedBy,
      reviewedAt: new Date(),
    },
  })

  return NextResponse.json(updated)
}
