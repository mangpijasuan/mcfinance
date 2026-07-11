import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'
import { sanitizeMember } from '@/lib/serializers'
import { nextMemberId } from '@/lib/publicIds'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const s = new URL(req.url).searchParams
  const search = s.get('search') || ''
  const status = s.get('status') || ''
  const risk   = s.get('risk') || ''
  const paid   = s.get('paid') || ''
  const page   = Math.max(1, parseInt(s.get('page') || '1'))
  const limit  = parseInt(s.get('limit') || '10')

  const where: any = {}
  if (search) where.OR = [
    { legalName: { contains: search } },
    { nickname:  { contains: search } },
    { id:        { contains: search } },
  ]
  if (status) where.status   = status
  if (risk)   where.riskFlag = risk
  if (paid)   where.thisMonth = paid

  const [members, total] = await Promise.all([
    prisma.member.findMany({ where, orderBy: { id: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.member.count({ where }),
  ])
  return NextResponse.json({ members: members.map(sanitizeMember), total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json()
  const id = nextMemberId()

  const member = await prisma.member.create({
    data: {
      id,
      legalName: body.legalName,
      nickname: body.nickname || null,
      joinDate: new Date(body.joinDate),
      status: body.status || 'Active',
      phoneNo: body.phoneNo || null,
      email: body.email || null,
      beneficiary: body.beneficiary || null,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(sanitizeMember(member), { status: 201 })
}
