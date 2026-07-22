import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMember, sessionMemberId } from '@/lib/apiAuth'

export async function GET() {
  const auth = await requireMember()
  if (auth.error) return auth.error
  const memberId = sessionMemberId(auth.session)!

  const payments = await prisma.portalPayment.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: 25,
  })

  return NextResponse.json({ payments })
}
