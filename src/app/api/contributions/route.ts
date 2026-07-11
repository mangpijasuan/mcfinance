import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'
import { nextPublicId } from '@/lib/publicIds'

function monthYearFromDate(date: Date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]}-${date.getFullYear()}`
}

function normalizeAutoPayDate(paymentDate: Date, paymentMethod?: string | null) {
  if (paymentMethod !== 'Auto-pay') return paymentDate
  const normalized = new Date(paymentDate)
  normalized.setDate(15)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

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
    { memberName:    { contains: search } },
    { memberId:      { contains: search } },
    { transactionId: { contains: search } },
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

  const body = await req.json()
  const paymentDate = normalizeAutoPayDate(new Date(body.paymentDate), body.paymentMethod)
  if (Number.isNaN(paymentDate.getTime())) {
    return NextResponse.json({ error: 'Invalid payment date' }, { status: 400 })
  }
  const amount = parseFloat(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0.' }, { status: 400 })
  }

  const transactionId = nextPublicId('CON')
  const member = await prisma.member.findUnique({
    where: { id: body.memberId },
    select: { legalName: true, archiveLifetime: true },
  })
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const contribution = await prisma.$transaction(async (tx) => {
    const createdContribution = await tx.contribution.create({
      data: {
        transactionId,
        memberId: body.memberId,
        memberName: member.legalName,
        paymentDate,
        monthYear: monthYearFromDate(paymentDate),
        amount,
        paymentMethod: body.paymentMethod || null,
        receivedBy: body.receivedBy || null,
        comments: body.comments || null,
        source: 'Admin',
      },
    })

    const agg = await tx.contribution.aggregate({ where: { memberId: body.memberId }, _sum: { amount: true } })
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const currentMonthCount = await tx.contribution.count({
      where: {
        memberId: body.memberId,
        paymentDate: { gte: monthStart, lt: nextMonthStart },
      },
    })

    const contributionsCurrentYear = agg._sum.amount ?? 0
    await tx.member.update({
      where: { id: body.memberId },
      data: {
        contributions2026: contributionsCurrentYear,
        overallContributions: (member.archiveLifetime ?? 0) + contributionsCurrentYear,
        lastContributionDate: paymentDate,
        thisMonth: currentMonthCount > 0 ? 'PAID' : 'NOT PAID',
      },
    })

    return createdContribution
  })

  return NextResponse.json(contribution, { status: 201 })
}
