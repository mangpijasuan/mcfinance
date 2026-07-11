import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'
import { recalcMemberLoanState } from '@/lib/memberLoanState'
import { nextPublicId } from '@/lib/publicIds'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const s = new URL(req.url).searchParams
  const loanId = s.get('loanId') || ''
  const search = s.get('search') || ''
  const year   = s.get('year') || ''
  const page   = Math.max(1, parseInt(s.get('page') || '1'))
  const limit  = parseInt(s.get('limit') || '50')

  const where: any = {}
  if (loanId) where.loanId = loanId
  if (search) where.OR = [
    { borrowerName: { contains: search } },
    { loanId:       { contains: search } },
    { paymentId:    { contains: search } },
  ]
  if (year) {
    const y = parseInt(year)
    if (!Number.isNaN(y)) {
      where.paymentDate = {
        gte: new Date(Date.UTC(y, 0, 1)),
        lt: new Date(Date.UTC(y + 1, 0, 1)),
      }
    }
  }

  const [payments, total, yearlyBreakdown] = await Promise.all([
    prisma.loanPayment.findMany({ where, orderBy: { paymentDate: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.loanPayment.count({ where }),
    prisma.loanPayment.groupBy({
      by: ['monthYear'],
      where,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { monthYear: 'asc' },
    }),
  ])
  const totalAmount = await prisma.loanPayment.aggregate({ where, _sum: { amount: true } })
  return NextResponse.json({
    payments,
    total,
    totalAmount: totalAmount._sum.amount ?? 0,
    page,
    pages: Math.ceil(total / limit),
    yearlyBreakdown,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json()
  const loan = await prisma.loan.findUnique({ where: { loanId: body.loanId } })
  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })

  const amount     = parseFloat(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0.' }, { status: 400 })
  }
  const newTotal   = loan.totalPaid + amount
  const newBalance = Math.max(0, loan.balanceRemaining - amount)
  const paidOff    = newBalance <= 0
  const paymentId  = nextPublicId('LP')
  const nextDue    = new Date(body.paymentDate); nextDue.setMonth(nextDue.getMonth() + 1)
  const d          = new Date(body.paymentDate)
  const monthYear  = `${d.toLocaleString('en-US', { month: 'short' })}-${d.getFullYear()}`

  const payment = await prisma.$transaction(async (tx) => {
    const createdPayment = await tx.loanPayment.create({
      data: {
        paymentId, loanId: body.loanId,
        borrowerId: loan.borrowerId, borrowerName: loan.borrowerName,
        paymentDate: new Date(body.paymentDate), amount,
        paymentMethod: body.paymentMethod || null,
        receivedBy: body.receivedBy || null,
        comments: body.comments || null,
        monthYear, source: 'Admin',
      },
    })

    await tx.loan.update({
      where: { loanId: body.loanId },
      data: {
        totalPaid: newTotal, balanceRemaining: newBalance,
        status: paidOff ? 'Paid Off' : 'Active',
        nextDueDate: paidOff ? null : nextDue,
        overdue: false,
      },
    })

    await recalcMemberLoanState(tx, loan.borrowerId)
    if (loan.cosignerId) {
      await recalcMemberLoanState(tx, loan.cosignerId)
    }

    return createdPayment
  })

  return NextResponse.json(payment, { status: 201 })
}
