// Ledger postings for loans on the loan engine (docs/architecture/04 §2,
// "Example postings"). Every business event has one entry with a fixed
// idempotency key, so posting is safe to repeat.
//
// Postings wait until the accounts they use are approved (see
// accounting/autoPost); postPendingLoanEntries() posts the backlog on a
// later run, so nothing is lost and nothing is posted twice.
import type { Prisma } from '@prisma/client'
import { type Cents, add, fromBigInt, fromLegacyDollars, subtract } from '@/lib/money'
import { isoDateOf } from '@/lib/dates'
import type { EntryInput, LineInput } from '@/modules/accounting/ledger'
import { CASH_ACCOUNTS, postWhenChartApproved, receiptAccount } from '@/modules/accounting/autoPost'
import { type LoanWithHistory, isEngineLoan, loadLoan, loanState } from './state'

type Tx = Prisma.TransactionClient

export const LOAN_ACCOUNTS = {
  ...CASH_ACCOUNTS,
  principal: '1100',
  fees: '1110',
  unapplied: '2100',
  applicationFeeIncome: '4000',
  lateFeeIncome: '4010',
  loanLosses: '5100',
} as const

export { receiptAccount }

const dr = (account: string, amount: Cents, sub: Partial<LineInput> = {}): LineInput[] => [{ account, debit: amount, ...sub }]
const cr = (account: string, amount: Cents, sub: Partial<LineInput> = {}): LineInput[] => (amount > 0 ? [{ account, credit: amount, ...sub }] : [])

export function disbursementEntry(loan: LoanWithHistory): EntryInput {
  const principal = fromBigInt(loan.principalCents!)
  const fee = fromBigInt(loan.applicationFeeCents!)
  return {
    effectiveDate: isoDateOf(loan.disbursedOn!),
    type: 'loan_disbursement',
    description: `Loan ${loan.loanId} paid out to ${loan.borrowerName}`,
    reference: loan.disbursementReference,
    source: { type: 'loan', id: loan.loanId },
    idempotencyKey: `loan-disbursement:${loan.loanId}`,
    lines: [
      ...dr(LOAN_ACCOUNTS.principal, principal, { memberId: loan.borrowerId, loanId: loan.loanId }),
      ...cr(LOAN_ACCOUNTS.bank, subtract(principal, fee)),
      ...cr(LOAN_ACCOUNTS.applicationFeeIncome, fee, { memo: 'Application fee, netted from the payout (Gate #1 A8)' }),
    ],
  }
}

function repaymentEntry(loan: LoanWithHistory, payment: LoanWithHistory['payments'][number], split: { fees: Cents; principal: Cents; unapplied: Cents }): EntryInput {
  return {
    effectiveDate: isoDateOf(payment.paymentDate),
    type: 'loan_repayment',
    description: `Repayment ${payment.paymentId} on loan ${loan.loanId}`,
    reference: payment.comments,
    source: { type: 'loan_payment', id: payment.paymentId },
    idempotencyKey: `loan-payment:${payment.paymentId}`,
    lines: [
      ...dr(receiptAccount(payment.paymentMethod), fromLegacyDollars(payment.amount)),
      ...cr(LOAN_ACCOUNTS.fees, split.fees, { memberId: loan.borrowerId }),
      ...cr(LOAN_ACCOUNTS.principal, split.principal, { memberId: loan.borrowerId, loanId: loan.loanId }),
      ...cr(LOAN_ACCOUNTS.unapplied, split.unapplied, { memberId: loan.borrowerId, memo: 'Overpayment held for the member' }),
    ],
  }
}

function lateFeeEntry(loan: LoanWithHistory, fee: LoanWithHistory['fees'][number]): EntryInput {
  const amount = fromBigInt(fee.amountCents)
  return {
    effectiveDate: isoDateOf(fee.assessedOn),
    type: 'fee',
    description: `Late fee ${fee.feeId} on loan ${loan.loanId}, installment ${fee.installmentNumber}`,
    source: { type: 'loan_fee', id: fee.feeId },
    idempotencyKey: `loan-fee:${fee.feeId}`,
    lines: [...dr(LOAN_ACCOUNTS.fees, amount, { memberId: loan.borrowerId }), ...cr(LOAN_ACCOUNTS.lateFeeIncome, amount)],
  }
}

function waiverEntry(loan: LoanWithHistory, fee: LoanWithHistory['fees'][number]): EntryInput {
  const amount = fromBigInt(fee.amountCents)
  return {
    effectiveDate: isoDateOf(fee.waivedOn!),
    type: 'fee_waiver',
    description: `Late fee ${fee.feeId} on loan ${loan.loanId} waived`,
    reference: fee.waiverReason,
    source: { type: 'loan_fee', id: fee.feeId },
    idempotencyKey: `loan-fee-waiver:${fee.feeId}`,
    lines: [...dr(LOAN_ACCOUNTS.lateFeeIncome, amount), ...cr(LOAN_ACCOUNTS.fees, amount, { memberId: loan.borrowerId })],
  }
}

function writeOffEntry(loan: LoanWithHistory, principal: Cents, fees: Cents): EntryInput {
  return {
    effectiveDate: isoDateOf(loan.chargedOffOn!),
    type: 'write_off',
    description: `Loan ${loan.loanId} written off`,
    source: { type: 'loan', id: loan.loanId },
    idempotencyKey: `loan-write-off:${loan.loanId}`,
    lines: [
      ...dr(LOAN_ACCOUNTS.loanLosses, add(principal, fees)),
      ...cr(LOAN_ACCOUNTS.principal, principal, { memberId: loan.borrowerId, loanId: loan.loanId }),
      ...cr(LOAN_ACCOUNTS.fees, fees, { memberId: loan.borrowerId }),
    ],
  }
}

/**
 * Post everything recorded on a loan that is not in the ledger yet:
 * disbursement, repayments, late fees, waivers and a write-off. Returns
 * the entry numbers posted.
 */
export async function postPendingLoanEntries(tx: Tx, loanId: string): Promise<string[]> {
  const loan = await loadLoan(tx, loanId)
  if (!loan || !isEngineLoan(loan)) return []
  const posted: string[] = []
  const post = async (input: EntryInput, save: (entryNumber: string) => Promise<unknown>) => {
    const entryNumber = await postWhenChartApproved(tx, input)
    if (entryNumber) {
      posted.push(entryNumber)
      await save(entryNumber)
    }
  }

  if (loan.disbursedOn && !loan.disbursementEntry) {
    await post(disbursementEntry(loan), (n) => tx.loan.update({ where: { loanId }, data: { disbursementEntry: n } }))
  }
  const state = loanState(loan, isoDateOf(new Date()))
  for (const payment of loan.payments.filter((p) => !p.journalEntry)) {
    await post(repaymentEntry(loan, payment, state.paymentSplits.get(payment.paymentId)!),
      (n) => tx.loanPayment.update({ where: { id: payment.id }, data: { journalEntry: n } }))
  }
  for (const fee of loan.fees) {
    if (!fee.journalEntry) {
      await post(lateFeeEntry(loan, fee), (n) => tx.loanFee.update({ where: { id: fee.id }, data: { journalEntry: n } }))
    }
    if (fee.status === 'waived' && !fee.waiverEntry) {
      await post(waiverEntry(loan, fee), (n) => tx.loanFee.update({ where: { id: fee.id }, data: { waiverEntry: n } }))
    }
  }
  if (loan.lifecycle === 'charged_off' && !loan.chargeOffEntry) {
    await post(writeOffEntry(loan, state.outstandingPrincipal, state.feesOutstanding),
      (n) => tx.loan.update({ where: { loanId }, data: { chargeOffEntry: n } }))
  }
  return posted
}
