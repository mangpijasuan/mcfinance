import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAnySession, sessionMemberId } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const auth = await requireAnySession()
  if (auth.error) return auth.error

  const role = (auth.session.user as any).role
  const memberId = sessionMemberId(auth.session)
  const s      = new URL(req.url).searchParams
  const status = s.get('status') || ''
  const search = s.get('search') || ''

  const where: any = {}
  if (role === 'admin') {
    if (status) where.status = status
    if (search) where.OR = [
      { borrowerName:  { contains: search } },
      { agreementId:   { contains: search } },
      { loanId:        { contains: search } },
    ]
  } else {
    where.OR = [
      { borrowerId: memberId },
      { cosignerId: memberId },
    ]
  }

  const agreements = await prisma.loanAgreement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { loan: { select: { loanDate: true, overdue: true } } },
  })

  return NextResponse.json(agreements)
}
