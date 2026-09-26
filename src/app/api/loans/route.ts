import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkLoanPolicy, calcApplicationFee } from '@/lib/loanPolicy'
import { requireAdmin } from '@/lib/apiAuth'
import { nextPublicId } from '@/lib/publicIds'
import { auditContext, recordAudit } from '@/modules/audit'
import { badRequest, parseDate, readJsonObject, requiredString } from '@/lib/http'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const s = new URL(req.url).searchParams
  const search = s.get('search') || ''
  const status = s.get('status') || ''

  const where: any = {}
  if (search) where.OR = [
    { borrowerName: { contains: search, mode: 'insensitive' } },
    { borrowerId:   { contains: search, mode: 'insensitive' } },
    { loanId:       { contains: search, mode: 'insensitive' } },
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

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const borrowerId = requiredString(body.borrowerId)
  if (!borrowerId) return badRequest('A borrower must be selected.')
  const cosignerId = requiredString(body.cosignerId)
  if (cosignerId === borrowerId) return badRequest('The borrower cannot co-sign their own loan.')
  const loanAmount = parseFloat(body.loanAmount)
  if (!Number.isFinite(loanAmount) || loanAmount <= 0) return badRequest('Loan amount must be greater than 0.')
  const termMonths = parseInt(body.termMonths)
  if (!Number.isInteger(termMonths) || termMonths <= 0) return badRequest('Term must be a whole number of months.')
  const loanDate = parseDate(body.loanDate)
  if (!loanDate) return badRequest('A valid loan date is required.')

  const borrower = await prisma.member.findUnique({
    where: { id: borrowerId },
    select: {
      id: true, legalName: true, status: true, monthsActive: true,
      archiveLifetime: true, contributions2026: true,
      activeAsBorrower: true, activeAsCosigner: true, eligible: true,
    },
  })
  if (!borrower) return NextResponse.json({ error: 'Borrower not found' }, { status: 404 })

  const cosigner = cosignerId
    ? await prisma.member.findUnique({ where: { id: cosignerId }, select: { id: true, legalName: true } })
    : null
  if (cosignerId && !cosigner) return NextResponse.json({ error: 'Co-signer not found' }, { status: 404 })

  // ── Policy enforcement ────────────────────────────────────
  const lastPaidLoan = await prisma.loan.findFirst({
    where: { borrowerId, status: 'Paid Off' },
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
  const endDate    = new Date(loanDate); endDate.setMonth(endDate.getMonth() + termMonths)

  // Payment due on the 10th of the month after loan date (per policy)
  const nextDue = new Date(loanDate)
  nextDue.setMonth(nextDue.getMonth() + 1)
  nextDue.setDate(10)

  const applicationFee = calcApplicationFee(loanAmount, termMonths)
  const monthlyDue     = Math.round((loanAmount / termMonths) * 100) / 100
  const agreementId    = nextPublicId('AGR')

  // Loan, agreement and member flags are written together or not at all.
  const loan = await prisma.$transaction(async (tx) => {
    const created = await tx.loan.create({
      data: {
        loanId, borrowerId, borrowerName: borrower.legalName,
        cosignerId, cosignerName: cosigner?.legalName || null,
        loanDate, termMonths, loanAmount, monthlyDue,
        totalPaid: 0, balanceRemaining: loanAmount,
        status: 'Active', endDate, nextDueDate: nextDue, overdue: false,
        notes: body.notes || null,
      },
    })

    await tx.loanAgreement.create({
      data: {
        agreementId, loanId,
        borrowerName: borrower.legalName, borrowerId,
        borrowerAddress: body.borrowerAddress || null,
        borrowerCity:    body.borrowerCity    || null,
        borrowerState:   body.borrowerState   || null,
        cosignerName: cosigner?.legalName || null,
        cosignerId,
        loanAmount, monthlyPayment: monthlyDue, termMonths,
        startDate: nextDue, endDate, applicationFee,
        status: 'pending',
      },
    })

    await tx.member.update({
      where: { id: borrowerId },
      data: { activeAsBorrower: 1, currentLoanBalance: loanAmount, eligible: 'NO - Active Loan/Cosign' },
    })
    if (cosignerId) {
      await tx.member.update({
        where: { id: cosignerId },
        data: { activeAsCosigner: 1, eligible: 'NO - Active Loan/Cosign' },
      })
    }

    await recordAudit(tx, auditContext(req, auth.session), {
      action: 'loan.create', entityType: 'loan', entityId: loanId, after: created,
      metadata: { agreementId, applicationFee },
    })
    return created
  })

  return NextResponse.json({ ...loan, applicationFee, agreementId }, { status: 201 })
}
