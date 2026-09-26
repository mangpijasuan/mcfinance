import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, requireAnySession, sessionMemberId } from '@/lib/apiAuth'
import { recalcMemberLoanState } from '@/lib/memberLoanState'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnySession()
  if (auth.error) return auth.error

  const { id } = await params
  const agreement = await prisma.loanAgreement.findUnique({
    where: { agreementId: id },
    include: { loan: true },
  })
  if (!agreement) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const role = (auth.session.user as any).role
  const memberId = sessionMemberId(auth.session)
  if (role !== 'admin' && memberId !== agreement.borrowerId && memberId !== agreement.cosignerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(agreement)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnySession()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()
  const { role } = auth.session.user as any
  const { signatureText, signerType, borrowerAddress, borrowerCity, borrowerState, action } = body

  const agreement = await prisma.loanAgreement.findUnique({ where: { agreementId: id } })
  if (!agreement) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const memberId = sessionMemberId(auth.session)

  if (role !== 'admin' && memberId !== agreement.borrowerId && memberId !== agreement.cosignerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (role === 'admin' && action === 'cancel') {
    const cancelled = await prisma.$transaction(async (tx) => {
      const cancelledAgreement = await tx.loanAgreement.update({
        where: { agreementId: id },
        data: { status: 'cancelled' },
      })

      // Remove linked loan/payment records so they disappear from member profile/portal
      if (cancelledAgreement.loanId) {
        await tx.loanPayment.deleteMany({ where: { loanId: cancelledAgreement.loanId } })
        await tx.loan.deleteMany({ where: { loanId: cancelledAgreement.loanId } })
      }

      await recalcMemberLoanState(tx, cancelledAgreement.borrowerId)
      if (cancelledAgreement.cosignerId) {
        await recalcMemberLoanState(tx, cancelledAgreement.cosignerId)
      }

      return cancelledAgreement
    })

    return NextResponse.json(cancelled)
  }

  // Build update
  const data: any = {}

  // Admin can sign as lender
  if (role === 'admin' && signerType === 'lender') {
    data.lenderSignature = signatureText
    data.lenderSignedAt  = new Date()
  }

  // Admin can also fill in borrower address details
  if (role === 'admin') {
    if (borrowerAddress !== undefined) data.borrowerAddress = borrowerAddress
    if (borrowerCity    !== undefined) data.borrowerCity    = borrowerCity
    if (borrowerState   !== undefined) data.borrowerState   = borrowerState
  }

  // Member signs as borrower (via portal)
  if (role === 'member' && signerType === 'borrower' && memberId === agreement.borrowerId) {
    data.borrowerSignature = signatureText
    data.borrowerSignedAt  = new Date()
    if (borrowerAddress !== undefined) data.borrowerAddress = borrowerAddress
    if (borrowerCity    !== undefined) data.borrowerCity    = borrowerCity
    if (borrowerState   !== undefined) data.borrowerState   = borrowerState
  }

  // Member signs as co-signer (via portal)
  if (role === 'member' && signerType === 'cosigner' && memberId === agreement.cosignerId) {
    data.cosignerSignature = signatureText
    data.cosignerSignedAt  = new Date()
  }

  if (role === 'member' && Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Recalculate status
  const updated = await prisma.loanAgreement.update({ where: { agreementId: id }, data })
  const newStatus = getStatus(updated)
  const final = await prisma.loanAgreement.update({
    where: { agreementId: id },
    data: { status: newStatus },
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

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const existing = await prisma.loanAgreement.findUnique({ where: { agreementId: id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    // Remove linked loan/payment records so they disappear from member profile/portal
    if (existing.loanId) {
      await tx.loanPayment.deleteMany({ where: { loanId: existing.loanId } })
      await tx.loan.deleteMany({ where: { loanId: existing.loanId } })
    }

    await tx.loanAgreement.delete({ where: { agreementId: id } })

    await recalcMemberLoanState(tx, existing.borrowerId)
    if (existing.cosignerId) {
      await recalcMemberLoanState(tx, existing.cosignerId)
    }
  })

  return NextResponse.json({ ok: true })
}
