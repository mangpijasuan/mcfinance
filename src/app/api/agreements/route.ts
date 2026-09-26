import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMemberOrPermission } from '@/modules/auth'

export async function GET(req: NextRequest) {
  const auth = await requireMemberOrPermission('agreements.read')
  if (auth.error) return auth.error

  const isStaff = auth.principal.kind === 'staff'
  const memberId = auth.principal.kind === 'member' ? auth.principal.memberId : undefined
  const s      = new URL(req.url).searchParams
  const status = s.get('status') || ''
  const search = s.get('search') || ''

  const where: any = {}
  if (isStaff) {
    if (status) where.status = status
    if (search) where.OR = [
      { borrowerName:  { contains: search, mode: 'insensitive' } },
      { agreementId:   { contains: search, mode: 'insensitive' } },
      { loanId:        { contains: search, mode: 'insensitive' } },
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
