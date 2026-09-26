import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'

export async function GET(req: NextRequest) {
  const auth = await requirePermission('payments.read')
  if (auth.error) return auth.error

  const s = new URL(req.url).searchParams
  const status = s.get('status') || ''

  const where: any = {}
  if (status) where.status = status

  const payments = await prisma.portalPayment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { member: { select: { legalName: true } } },
  })

  return NextResponse.json({ payments })
}
