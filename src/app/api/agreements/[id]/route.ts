import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { can, requireMemberOrPermission } from '@/modules/auth'
import { recalcMemberLoanState } from '@/lib/memberLoanState'
import { badRequest, readJsonObject, requiredString } from '@/lib/http'
import { auditContext, recordAudit } from '@/modules/audit'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMemberOrPermission('agreements.read')
  if (auth.error) return auth.error

  const { id } = await params
  const agreement = await prisma.loanAgreement.findUnique({
    where: { agreementId: id },
    include: { loan: true },
  })
  if (!agreement) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const memberId = auth.principal.kind === 'member' ? auth.principal.memberId : undefined
  if (auth.principal.kind === 'member' && memberId !== agreement.borrowerId && memberId !== agreement.cosignerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(agreement)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMemberOrPermission('agreements.read')
  if (auth.error) return auth.error
  const principal = auth.principal
  const isStaff = principal.kind === 'staff'
  const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const { signerType, borrowerAddress, borrowerCity, borrowerState, action } = body

  const agreement = await prisma.loanAgreement.findUnique({ where: { agreementId: id } })
  if (!agreement) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const memberId = principal.kind === 'member' ? principal.memberId : undefined

  if (!isStaff && memberId !== agreement.borrowerId && memberId !== agreement.cosignerId) {
    return forbidden()
  }
  if (agreement.status === 'cancelled') {
    return NextResponse.json({ error: 'This agreement has been cancelled.' }, { status: 409 })
  }
  const ctx = auditContext(req, principal)

  // Cancelling keeps every record (Gate #1 A3) and is only possible while
  // no repayment has been recorded (A9); after that, record a payoff.
  if (isStaff && action === 'cancel') {
    if (!can(principal, 'loans.cancel')) return forbidden()
    const cancelled = await prisma.$transaction(async (tx) => {
      const repayments = await tx.loanPayment.count({ where: { loanId: agreement.loanId } })
      if (repayments > 0) return null

      const cancelledAgreement = await tx.loanAgreement.update({
        where: { agreementId: id },
        data: { status: 'cancelled' },
      })
      const loanBefore = await tx.loan.findUnique({ where: { loanId: agreement.loanId } })
      const loanAfter = loanBefore
        ? await tx.loan.update({
            where: { loanId: agreement.loanId },
            data: { status: 'Cancelled', balanceRemaining: 0, nextDueDate: null, overdue: false },
          })
        : null

      await recalcMemberLoanState(tx, cancelledAgreement.borrowerId)
      if (cancelledAgreement.cosignerId) {
        await recalcMemberLoanState(tx, cancelledAgreement.cosignerId)
      }

      await recordAudit(tx, ctx, {
        action: 'agreement.cancel', entityType: 'agreement', entityId: id,
        before: agreement, after: cancelledAgreement, metadata: { loanBefore, loanAfter },
      })
      return cancelledAgreement
    })

    if (!cancelled) {
      return NextResponse.json(
        { error: 'Repayments have already been recorded on this loan, so it cannot be cancelled. Record a payoff instead.' },
        { status: 409 },
      )
    }
    return NextResponse.json(cancelled)
  }

  // Build update
  const data: any = {}
  let signatureText: string | null = null
  if (signerType !== undefined) {
    signatureText = requiredString(body.signatureText)
    if (!signatureText) return badRequest('Type your full name to sign.')
  }

  // Staff sign for the club as lender
  if (isStaff && signerType === 'lender') {
    if (!can(principal, 'agreements.sign_lender')) return forbidden()
    if (agreement.lenderSignature) return NextResponse.json({ error: 'Already signed by the lender.' }, { status: 409 })
    data.lenderSignature = signatureText
    data.lenderSignedAt  = new Date()
  }

  // Staff can fill in borrower address details
  const addressChange = borrowerAddress !== undefined || borrowerCity !== undefined || borrowerState !== undefined
  if (isStaff && addressChange) {
    if (!can(principal, 'agreements.update')) return forbidden()
    if (borrowerAddress !== undefined) data.borrowerAddress = borrowerAddress
    if (borrowerCity    !== undefined) data.borrowerCity    = borrowerCity
    if (borrowerState   !== undefined) data.borrowerState   = borrowerState
  }

  // Member signs as borrower (via portal)
  if (!isStaff && signerType === 'borrower' && memberId === agreement.borrowerId) {
    if (agreement.borrowerSignature) return NextResponse.json({ error: 'Already signed by the borrower.' }, { status: 409 })
    data.borrowerSignature = signatureText
    data.borrowerSignedAt  = new Date()
    if (borrowerAddress !== undefined) data.borrowerAddress = borrowerAddress
    if (borrowerCity    !== undefined) data.borrowerCity    = borrowerCity
    if (borrowerState   !== undefined) data.borrowerState   = borrowerState
  }

  // Member signs as co-signer (via portal)
  if (!isStaff && signerType === 'cosigner' && memberId === agreement.cosignerId) {
    if (agreement.cosignerSignature) return NextResponse.json({ error: 'Already signed by the co-signer.' }, { status: 409 })
    data.cosignerSignature = signatureText
    data.cosignerSignedAt  = new Date()
  }

  if (Object.keys(data).length === 0) {
    return isStaff ? badRequest('Nothing to change.') : forbidden()
  }

  // Apply the change and recalculate the status together
  const final = await prisma.$transaction(async (tx) => {
    const updated = await tx.loanAgreement.update({ where: { agreementId: id }, data })
    const saved = await tx.loanAgreement.update({
      where: { agreementId: id },
      data: { status: getStatus(updated) },
    })
    await recordAudit(tx, ctx, {
      action: signerType ? `agreement.sign.${signerType}` : 'agreement.update',
      entityType: 'agreement', entityId: id, before: agreement, after: saved,
    })
    return saved
  })

  return NextResponse.json(final)
}

function getStatus(a: any): string {
  if (a.status === 'cancelled') return 'cancelled'
  const hasCosigner = !!a.cosignerId
  if (a.lenderSignature && a.borrowerSignature && (!hasCosigner || a.cosignerSignature)) return 'fully_signed'
  if (a.cosignerSignature && a.borrowerSignature) return 'cosigner_signed'
  if (a.borrowerSignature) return 'borrower_signed'
  return 'pending'
}

// No DELETE: agreements are never hard-deleted (Gate #1 A3). Use the
// cancel action, which keeps the loan and agreement records.
