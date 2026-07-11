import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkLoanPolicy, calcApplicationFee } from '@/lib/loanPolicy'
import { requireAdmin } from '@/lib/apiAuth'
import { nextPublicId } from '@/lib/publicIds'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const s = new URL(req.url).searchParams
  const search = s.get('search') || ''
  const status = s.get('status') || ''

  const where: any = {}
  if (search) where.OR = [
    { borrowerName: { contains: search } },
    { borrowerId:   { contains: search } },
    { loanId:       { contains: search } },
  ]
  if (status) where.status = status

  const loans = await prisma.loan.findMany({
    where, orderBy: [{ overdue: 'desc' }, { loanDate: 'desc' }],
    include: {
      payments:  { orderBy: { paymentDate: 'desc' }, take: 3 },
      agreement: { select: { agreementId: true, status: true } },
    },
  })
  return NextResponse.json(loans)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json()

  const borrower = await prisma.member.findUnique({
    where: { id: body.borrowerId },
    select: {
      id: true, legalName: true, status: true, monthsActive: true,
      archiveLifetime: true, contributions2026: true,
      activeAsBorrower: true, activeAsCosigner: true, eligible: true,
    },
  })
  if (!borrower) return NextResponse.json({ error: 'Borrower not found' }, { status: 404 })

  const cosigner = body.cosignerId
    ? await prisma.member.findUnique({ where: { id: body.cosignerId }, select: { id: true, legalName: true } })
    : null

  const loanAmount = parseFloat(body.loanAmount)
  const termMonths = parseInt(body.termMonths)

  // ── Policy enforcement ────────────────────────────────────
  const lastPaidLoan = await prisma.loan.findFirst({
    where: { borrowerId: body.borrowerId, status: 'Paid Off' },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  })

  const check = checkLoanPolicy(borrower, loanAmount, termMonths, lastPaidLoan?.updatedAt)

  if (!check.eligible) {
    return NextResponse.json(
      { error: 'Loan application does not meet policy requirements.', violations: check.errors },
      { status: 422 }
    )
  }
  // ─────────────────────────────────────────────────────────

  const loanId     = nextPublicId('L')
  const loanDate   = new Date(body.loanDate)
  const endDate    = new Date(loanDate); endDate.setMonth(endDate.getMonth() + termMonths)

  // Payment due on the 10th of the month after loan date (per policy)
  const nextDue = new Date(loanDate)
  nextDue.setMonth(nextDue.getMonth() + 1)
  nextDue.setDate(10)

  const applicationFee = calcApplicationFee(loanAmount, termMonths)
  const monthlyDue     = Math.round((loanAmount / termMonths) * 100) / 100

  const [loan] = await Promise.all([
    prisma.loan.create({
      data: {
        loanId, borrowerId: body.borrowerId, borrowerName: borrower.legalName,
        cosignerId: body.cosignerId || null, cosignerName: cosigner?.legalName || null,
        loanDate, termMonths, loanAmount, monthlyDue,
        totalPaid: 0, balanceRemaining: loanAmount,
        status: 'Active', endDate, nextDueDate: nextDue, overdue: false,
        notes: body.notes || null,
      },
    }),
  ])

  // ── Auto-generate agreement ───────────────────────────────
  const agreementId = nextPublicId('AGR')

  await prisma.loanAgreement.create({
    data: {
      agreementId, loanId,
      borrowerName: borrower.legalName, borrowerId: body.borrowerId,
      borrowerAddress: body.borrowerAddress || null,
      borrowerCity:    body.borrowerCity    || null,
      borrowerState:   body.borrowerState   || null,
      cosignerName: cosigner?.legalName || null,
      cosignerId:   body.cosignerId     || null,
      loanAmount, monthlyPayment: monthlyDue, termMonths,
      startDate: nextDue, endDate, applicationFee,
      status: 'pending',
    },
  })
  // ─────────────────────────────────────────────────────────

  await Promise.all([
    prisma.member.update({
      where: { id: body.borrowerId },
      data: { activeAsBorrower: 1, currentLoanBalance: loanAmount, eligible: 'NO - Active Loan/Cosign' },
    }),
    ...(body.cosignerId ? [prisma.member.update({
      where: { id: body.cosignerId },
      data: { activeAsCosigner: 1, eligible: 'NO - Active Loan/Cosign' },
    })] : []),
  ])

  return NextResponse.json({ ...loan, applicationFee, agreementId }, { status: 201 })
}
