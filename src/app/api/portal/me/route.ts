import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMember, sessionMemberId } from '@/lib/apiAuth'
import { sanitizeMember } from '@/lib/serializers'

export async function GET() {
  const auth = await requireMember()
  if (auth.error) return auth.error
  const memberId = sessionMemberId(auth.session)!

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      loansAsBorrower: {
        where: { agreement: { is: { status: { not: 'cancelled' } } } },
        include: { payments: { orderBy: { paymentDate: 'desc' }, take: 5 } },
        orderBy: { loanDate: 'desc' },
        take: 1,
      },
      contributions: {
        orderBy: { paymentDate: 'desc' },
        take: 6,
      },
    },
  })

  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Strip sensitive fields
  return NextResponse.json(sanitizeMember(member as any))
}
