import type { Prisma } from '@prisma/client'
import { nextPublicId } from './publicIds'
import { recalcMemberLoanState } from './memberLoanState'
import { OperationError } from './operationError'
import { MoneyError, fromLegacyDollars } from './money'
import { todayIso } from './dates'
import { isEngineLoan, refreshLoan } from '@/modules/loans/state'
import { postPendingLoanEntries } from '@/modules/loans/postings'

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

/** Why a loan cannot take a repayment right now, or null. */
export function repaymentBlocker(loan: { lifecycle: string; principalCents: bigint | null }): string | null {
  switch (loan.lifecycle) {
    case 'cancelled': return 'This loan was cancelled.'
    case 'charged_off': return 'This loan was written off; recording recoveries is not supported yet.'
    case 'paid_off': return isEngineLoan(loan) ? 'This loan is already paid off.' : null
    case 'approved':
    case 'agreement_signed':
      return isEngineLoan(loan) ? 'This loan has not been paid out yet. Record the disbursement first.' : null
    default: return null
  }
}

/**
 * Creates a LoanPayment and updates the loan and borrower/cosigner state.
 * Must run inside a transaction. On a loan with a stored schedule the
 * payment is split by the loan engine (fees, overdue, current, prepay;
 * Gate #1 A6), the balance is derived from the schedule, and the payment
 * posts to the ledger once the chart is approved.
 */
export async function recordLoanPayment(tx: Tx, params: RecordLoanPaymentParams) {
  const loan = await tx.loan.findUnique({ where: { loanId: params.loanId } })
  if (!loan) throw new Error('Loan not found')
  const blocked = repaymentBlocker(loan)
  if (blocked) throw new OperationError(409, blocked)
  if (isEngineLoan(loan)) return recordEngineLoanPayment(tx, loan, params)

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
      ...(paidOff && loan.lifecycle === 'disbursed' ? { lifecycle: 'paid_off' } : {}),
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

async function recordEngineLoanPayment(tx: Tx, loan: { loanId: string; borrowerId: string; borrowerName: string; cosignerId: string | null }, params: RecordLoanPaymentParams) {
  try {
    fromLegacyDollars(params.amount)
  } catch (err) {
    if (err instanceof MoneyError) throw new OperationError(400, 'Amount must be in whole cents.')
    throw err
  }
  const createdPayment = await tx.loanPayment.create({
    data: {
      paymentId: nextPublicId('LP'), loanId: loan.loanId,
      borrowerId: loan.borrowerId, borrowerName: loan.borrowerName,
      paymentDate: params.paymentDate, amount: params.amount,
      paymentMethod: params.paymentMethod || null,
      receivedBy: params.receivedBy || null,
      comments: params.comments || null,
      monthYear: `${params.paymentDate.toLocaleString('en-US', { month: 'short' })}-${params.paymentDate.getFullYear()}`,
      source: params.source,
    },
  })
  await refreshLoan(tx, loan.loanId, todayIso())
  await recalcMemberLoanState(tx, loan.borrowerId)
  if (loan.cosignerId) await recalcMemberLoanState(tx, loan.cosignerId)
  const journalEntries = await postPendingLoanEntries(tx, loan.loanId)
  return { ...createdPayment, journalEntries }
}
