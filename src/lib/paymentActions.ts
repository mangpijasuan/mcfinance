import type { Prisma } from '@prisma/client'
import { nextPublicId } from './publicIds'
import { recalcMemberLoanState } from './memberLoanState'

type Tx = Prisma.TransactionClient

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

export type RecordContributionParams = {
  memberId: string
  amount: number
  paymentDate: Date
  paymentMethod?: string | null
  receivedBy?: string | null
  comments?: string | null
  source: string
}

/** Creates a Contribution and updates the member's running totals. Must run inside a transaction. */
export async function recordContribution(tx: Tx, params: RecordContributionParams) {
  const member = await tx.member.findUnique({
    where: { id: params.memberId },
    select: { legalName: true, archiveLifetime: true },
  })
  if (!member) throw new Error('Member not found')

  const paymentDate = normalizeAutoPayDate(params.paymentDate, params.paymentMethod)
  const transactionId = nextPublicId('CON')

  const createdContribution = await tx.contribution.create({
    data: {
      transactionId,
      memberId: params.memberId,
      memberName: member.legalName,
      paymentDate,
      monthYear: monthYearFromDate(paymentDate),
      amount: params.amount,
      paymentMethod: params.paymentMethod || null,
      receivedBy: params.receivedBy || null,
      comments: params.comments || null,
      source: params.source,
    },
  })

  const agg = await tx.contribution.aggregate({ where: { memberId: params.memberId }, _sum: { amount: true } })
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const currentMonthCount = await tx.contribution.count({
    where: {
      memberId: params.memberId,
      paymentDate: { gte: monthStart, lt: nextMonthStart },
    },
  })

  const contributionsCurrentYear = agg._sum.amount ?? 0
  await tx.member.update({
    where: { id: params.memberId },
    data: {
      contributions2026: contributionsCurrentYear,
      overallContributions: (member.archiveLifetime ?? 0) + contributionsCurrentYear,
      lastContributionDate: paymentDate,
      thisMonth: currentMonthCount > 0 ? 'PAID' : 'NOT PAID',
    },
  })

  return createdContribution
}

export type RecordLoanPaymentParams = {
  loanId: string
  amount: number
  paymentDate: Date
  paymentMethod?: string | null
  receivedBy?: string | null
  comments?: string | null
  source: string
}

/** Creates a LoanPayment, updates the loan balance, and recalcs borrower/cosigner state. Must run inside a transaction. */
export async function recordLoanPayment(tx: Tx, params: RecordLoanPaymentParams) {
  const loan = await tx.loan.findUnique({ where: { loanId: params.loanId } })
  if (!loan) throw new Error('Loan not found')

  const newTotal = loan.totalPaid + params.amount
  const newBalance = Math.max(0, loan.balanceRemaining - params.amount)
  const paidOff = newBalance <= 0
  const paymentId = nextPublicId('LP')
  const nextDue = new Date(params.paymentDate)
  nextDue.setMonth(nextDue.getMonth() + 1)
  const monthYear = `${params.paymentDate.toLocaleString('en-US', { month: 'short' })}-${params.paymentDate.getFullYear()}`

  const createdPayment = await tx.loanPayment.create({
    data: {
      paymentId, loanId: params.loanId,
      borrowerId: loan.borrowerId, borrowerName: loan.borrowerName,
      paymentDate: params.paymentDate, amount: params.amount,
      paymentMethod: params.paymentMethod || null,
      receivedBy: params.receivedBy || null,
      comments: params.comments || null,
      monthYear, source: params.source,
    },
  })

  await tx.loan.update({
    where: { loanId: params.loanId },
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
}
