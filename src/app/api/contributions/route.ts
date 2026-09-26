import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'
import { recordContribution } from '@/lib/paymentActions'
import { badRequest, readJsonObject, requiredString } from '@/lib/http'
import { auditContext, recordAudit } from '@/modules/audit'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const s = new URL(req.url).searchParams
  const search = s.get('search') || ''
  const month  = s.get('month') || ''
  const method = s.get('method') || ''
  const page   = Math.max(1, parseInt(s.get('page') || '1'))
  const limit  = parseInt(s.get('limit') || '50')

  const where: any = {}
  if (search) where.OR = [
    { memberName:    { contains: search, mode: 'insensitive' } },
    { memberId:      { contains: search, mode: 'insensitive' } },
    { transactionId: { contains: search, mode: 'insensitive' } },
  ]
  if (month)  where.monthYear      = month
  if (method) where.paymentMethod  = method

  const [contributions, total] = await Promise.all([
    prisma.contribution.findMany({ where, orderBy: { paymentDate: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.contribution.count({ where }),
  ])
  const totalAmount = await prisma.contribution.aggregate({ where, _sum: { amount: true } })
  return NextResponse.json({ contributions, total, totalAmount: totalAmount._sum.amount ?? 0, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const memberId = requiredString(body.memberId)
  if (!memberId) return badRequest('A member must be selected.')
  const paymentDate = new Date(body.paymentDate)
  if (Number.isNaN(paymentDate.getTime())) {
    return NextResponse.json({ error: 'Invalid payment date' }, { status: 400 })
  }
  const amount = parseFloat(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0.' }, { status: 400 })
  }

  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } })
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const contribution = await prisma.$transaction(async (tx) => {
    const created = await recordContribution(tx, {
      memberId,
      amount,
      paymentDate,
      paymentMethod: body.paymentMethod || null,
      receivedBy: body.receivedBy || null,
      comments: body.comments || null,
      source: 'Admin',
    })
    await recordAudit(tx, auditContext(req, auth.session), {
      action: 'contribution.create', entityType: 'contribution', entityId: created.transactionId, after: created,
    })
    return created
  })

  return NextResponse.json(contribution, { status: 201 })
}
