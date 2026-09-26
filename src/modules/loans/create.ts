import type { Prisma } from '@prisma/client'
import { checkLoanPolicy, calcApplicationFee } from '@/lib/loanPolicy'
import { nextPublicId } from '@/lib/publicIds'
import { OperationError } from '@/lib/operationError'
import { type AuditContext, recordAudit } from '@/modules/audit'
import type { Actors } from '@/modules/approvals/actors'

type Db = Pick<Prisma.TransactionClient, 'member' | 'loan'>

export type LoanInput = {
  borrowerId: string
  cosignerId: string | null
  loanAmount: number // dollars (legacy column)
  termMonths: number
  loanDate: string // ISO
  notes: string | null
  borrowerAddress: string | null
  borrowerCity: string | null
  borrowerState: string | null
}

/** Eligibility and policy checks: before queueing for approval, and again at execution. */
export async function checkLoan(db: Db, input: LoanInput) {
  const borrower = await db.member.findUnique({
    where: { id: input.borrowerId },
    select: {
      id: true, legalName: true, status: true, monthsActive: true,
      archiveLifetime: true, contributions2026: true,
      activeAsBorrower: true, activeAsCosigner: true, eligible: true,
    },
  })
  if (!borrower) throw new OperationError(404, 'Borrower not found')
  const cosigner = input.cosignerId
    ? await db.member.findUnique({ where: { id: input.cosignerId }, select: { id: true, legalName: true } })
    : null
  if (input.cosignerId && !cosigner) throw new OperationError(404, 'Co-signer not found')

  const lastPaidLoan = await db.loan.findFirst({
    where: { borrowerId: input.borrowerId, status: 'Paid Off' },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  })
  const check = checkLoanPolicy(borrower, input.loanAmount, input.termMonths, lastPaidLoan?.updatedAt)
  if (!check.eligible) {
    throw new OperationError(422, 'Loan application does not meet policy requirements.', { violations: check.errors })
  }
  return { borrower, cosigner }
}

/** Create the loan, its agreement and the member flags, together. */
export async function createLoan(tx: Prisma.TransactionClient, input: LoanInput, actors: Actors, ctx: AuditContext) {
  const { borrower, cosigner } = await checkLoan(tx, input)
  const { borrowerId, cosignerId, loanAmount, termMonths } = input
  const loanDate = new Date(input.loanDate)
  const loanId = nextPublicId('L')
  const endDate = new Date(loanDate); endDate.setMonth(endDate.getMonth() + termMonths)
  // Payment due on the 10th of the month after loan date (per policy)
  const nextDue = new Date(loanDate)
  nextDue.setMonth(nextDue.getMonth() + 1)
  nextDue.setDate(10)
  const applicationFee = calcApplicationFee(loanAmount, termMonths)
  const monthlyDue = Math.round((loanAmount / termMonths) * 100) / 100
  const agreementId = nextPublicId('AGR')

  const created = await tx.loan.create({
    data: {
      loanId, borrowerId, borrowerName: borrower.legalName,
      cosignerId, cosignerName: cosigner?.legalName || null,
      loanDate, termMonths, loanAmount, monthlyDue,
      totalPaid: 0, balanceRemaining: loanAmount,
      status: 'Active', endDate, nextDueDate: nextDue, overdue: false,
      notes: input.notes,
    },
  })
  await tx.loanAgreement.create({
    data: {
      agreementId, loanId,
      borrowerName: borrower.legalName, borrowerId,
      borrowerAddress: input.borrowerAddress,
      borrowerCity: input.borrowerCity,
      borrowerState: input.borrowerState,
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
    await tx.member.update({ where: { id: cosignerId }, data: { activeAsCosigner: 1, eligible: 'NO - Active Loan/Cosign' } })
  }
  await recordAudit(tx, ctx, {
    action: 'loan.create', entityType: 'loan', entityId: loanId, after: created,
    metadata: { agreementId, applicationFee, maker: actors.maker.id, checker: actors.checker?.id ?? null },
  })
  return { ...created, applicationFee, agreementId }
}
