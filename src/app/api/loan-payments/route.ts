import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { badRequest, readJsonObject, requiredString } from '@/lib/http'
import { recordLoanPayment } from '@/lib/paymentActions'
import { cents, formatUSD, parseDollars, toLegacyDollars } from '@/lib/money'
import { todayIso } from '@/lib/dates'
import { operationErrorResponse } from '@/lib/operationError'
import { auditContext, recordAudit } from '@/modules/audit'
import { isEngineLoan, loadLoan, loanState } from '@/modules/loans/state'

export async function GET(req: NextRequest) {
  const auth = await requirePermission('loan_payments.read')
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
    { borrowerName: { contains: search, mode: 'insensitive' } },
    { loanId:       { contains: search, mode: 'insensitive' } },
    { paymentId:    { contains: search, mode: 'insensitive' } },
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
  const auth = await requirePermission('loan_payments.record')
  if (auth.error) return auth.error

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const loanId = requiredString(body.loanId)
  if (!loanId) return badRequest('A loan must be selected.')
  const loan = await prisma.loan.findUnique({ where: { loanId }, select: { loanId: true, totalPaid: true, balanceRemaining: true, status: true, lifecycle: true } })
  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })

  let amountCents: number
  try {
    amountCents = parseDollars(typeof body.amount === 'number' ? body.amount : String(body.amount ?? ''))
  } catch {
    return badRequest('Amount must be a dollar amount with at most two decimals.')
  }
  if (amountCents <= 0) return NextResponse.json({ error: 'Amount must be greater than 0.' }, { status: 400 })
  const amount = toLegacyDollars(cents(amountCents))

  // On the loan engine a staff-entered payment cannot exceed what is owed.
  const engine = await loadLoan(prisma, loanId)
  if (engine && isEngineLoan(engine) && engine.lifecycle === 'disbursed') {
    const { payoff } = loanState(engine, todayIso())
    if (amountCents > payoff) {
      return NextResponse.json({ error: `That is more than the ${formatUSD(payoff)} needed to pay the loan off.` }, { status: 422 })
    }
  }
  const paymentDate = new Date(body.paymentDate)
  if (Number.isNaN(paymentDate.getTime())) {
    return NextResponse.json({ error: 'Invalid payment date' }, { status: 400 })
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const created = await recordLoanPayment(tx, {
        loanId,
        amount,
        paymentDate,
        paymentMethod: body.paymentMethod || null,
        receivedBy: body.receivedBy || null,
        comments: body.comments || null,
        source: 'Admin',
      })
      const loanAfter = await tx.loan.findUnique({ where: { loanId }, select: { loanId: true, totalPaid: true, balanceRemaining: true, status: true } })
      await recordAudit(tx, auditContext(req, auth.principal), {
        action: 'loan_payment.create', entityType: 'loan_payment', entityId: created.paymentId, after: created,
        metadata: { loanBefore: loan, loanAfter },
      })
      return created
    })
    return NextResponse.json(payment, { status: 201 })
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
