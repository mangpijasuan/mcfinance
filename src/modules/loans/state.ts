// Where a loan on the loan engine stands, derived from its stored schedule
// and everything recorded against it. Nothing here is kept by hand: the
// legacy balance columns are refreshed from this after every change.
//
// Events replay in the order they were recorded (a database sequence, not
// the effective date or a clock), so the split of every payment is exactly
// what was posted to the ledger at the time, even when a payment is
// back-dated.
import type { Prisma } from '@prisma/client'
import { type Cents, ZERO, add, fromBigInt, fromLegacyDollars, subtract, sum, toLegacyDollars } from '@/lib/money'
import { type IsoDate, dateOnly, isoDateOf } from '@/lib/dates'
import { recalcMemberLoanState } from '@/lib/memberLoanState'
import {
  type Delinquency, type LoanEvent, type LoanPosition, type Schedule, delinquency, outstandingPrincipal, payoffAmount, replay,
} from './amortization'

type Tx = Prisma.TransactionClient
type Db = Pick<Tx, 'loan'>

export const LOAN_WITH_HISTORY = {
  installments: { orderBy: { number: 'asc' } },
  payments: { orderBy: { eventSeq: 'asc' } },
  fees: { orderBy: { eventSeq: 'asc' } },
} satisfies Prisma.LoanInclude

export type LoanWithHistory = Prisma.LoanGetPayload<{ include: typeof LOAN_WITH_HISTORY }>

/** Loans made before the loan engine have no stored schedule. */
export function isEngineLoan(loan: { principalCents: bigint | null }): boolean {
  return loan.principalCents !== null
}

export function scheduleOf(loan: LoanWithHistory): Schedule {
  const installments = loan.installments.map((it) => {
    const principal = fromBigInt(it.principalCents)
    return { number: it.number, dueDate: isoDateOf(it.dueDate), principal, interest: fromBigInt(it.interestCents), total: principal }
  })
  const total = sum(installments.map((it) => it.principal))
  return { installments, totalPrincipal: total, totalRepayable: total, policyVersion: loan.policyVersion! }
}

type Recorded =
  | { kind: 'payment'; seq: bigint; id: string; payment: LoanWithHistory['payments'][number] }
  | { kind: 'fee' | 'waiver'; seq: bigint; id: string; fee: LoanWithHistory['fees'][number] }

function recordedEvents(loan: LoanWithHistory): Recorded[] {
  const events: Recorded[] = [
    ...loan.payments.map((payment) => ({ kind: 'payment' as const, seq: payment.eventSeq, id: payment.paymentId, payment })),
    ...loan.fees.map((fee) => ({ kind: 'fee' as const, seq: fee.eventSeq, id: fee.feeId, fee })),
    ...loan.fees.filter((fee) => fee.waiverSeq !== null).map((fee) => ({ kind: 'waiver' as const, seq: fee.waiverSeq!, id: fee.feeId, fee })),
  ]
  return events.sort((a, b) => Number(a.seq - b.seq))
}

export type PaymentSplit = { fees: Cents; principal: Cents; unapplied: Cents }

export type InstallmentView = {
  number: number
  dueDate: IsoDate
  amount: Cents
  paid: Cents
  remaining: Cents
  status: 'paid' | 'partly_paid' | 'overdue' | 'due'
}

export type LoanState = {
  schedule: Schedule
  position: LoanPosition
  installments: InstallmentView[]
  outstandingPrincipal: Cents
  feesOutstanding: Cents
  payoff: Cents
  totalPaid: Cents
  /** Overpayments held for the member (ledger account 2100). */
  unapplied: Cents
  paymentSplits: Map<string, PaymentSplit>
  delinquency: Delinquency
  nextDueDate: IsoDate | null
}

export function loanState(loan: LoanWithHistory, asOf: IsoDate): LoanState {
  const schedule = scheduleOf(loan)
  const recorded = recordedEvents(loan)
  const events: LoanEvent[] = recorded.map((e) => {
    if (e.kind === 'payment') return { type: 'payment', amount: fromLegacyDollars(e.payment.amount), asOf: isoDateOf(e.payment.paymentDate) }
    return { type: e.kind === 'fee' ? 'fee' : 'fee_waiver', amount: fromBigInt(e.fee.amountCents) }
  })
  const { position, unapplied, allocations } = replay(schedule, events)

  const paymentSplits = new Map<string, PaymentSplit>()
  recorded.forEach((e, i) => {
    if (e.kind !== 'payment') return
    const fees = sum(allocations[i].filter((a) => a.kind === 'fee').map((a) => a.amount))
    const principal = sum(allocations[i].filter((a) => a.kind !== 'fee').map((a) => a.amount))
    paymentSplits.set(e.id, { fees, principal, unapplied: subtract(fromLegacyDollars(e.payment.amount), add(fees, principal)) })
  })

  const installments = schedule.installments.map((it, i): InstallmentView => {
    const paid = position.paid[i]
    const remaining = subtract(it.principal, paid)
    const status = remaining === 0 ? 'paid' : it.dueDate < asOf ? 'overdue' : paid > 0 ? 'partly_paid' : 'due'
    return { number: it.number, dueDate: it.dueDate, amount: it.principal, paid, remaining, status }
  })

  return {
    schedule,
    position,
    installments,
    outstandingPrincipal: outstandingPrincipal(position),
    feesOutstanding: position.feesOutstanding,
    payoff: payoffAmount(position),
    totalPaid: sum(loan.payments.map((p) => fromLegacyDollars(p.amount))),
    unapplied,
    paymentSplits,
    delinquency: delinquency(position, asOf, loan.graceDays!),
    nextDueDate: installments.find((it) => it.remaining > 0)?.dueDate ?? null,
  }
}

export async function loadLoan(db: Db, loanId: string): Promise<LoanWithHistory | null> {
  return db.loan.findUnique({ where: { loanId }, include: LOAN_WITH_HISTORY })
}

/**
 * Bring the loan's stored fields up to date with its state as of a date:
 * balance, next due date, delinquency (never set by hand, F-6/F-12), and
 * payoff. Returns the state and what changed.
 */
export async function refreshLoan(tx: Tx, loanId: string, asOf: IsoDate) {
  const loan = await loadLoan(tx, loanId)
  if (!loan || !isEngineLoan(loan)) throw new Error(`refreshLoan: ${loanId} is not on the loan engine`)
  const state = loanState(loan, asOf)
  const servicing = loan.lifecycle === 'disbursed'
  const paidOff = servicing && state.payoff === ZERO
  const delinquencyStatus = servicing && !paidOff ? (state.delinquency.status === 'delinquent' ? 'delinquent' : 'current') : null

  const data: Prisma.LoanUpdateInput = {
    totalPaid: toLegacyDollars(state.totalPaid),
    balanceRemaining: toLegacyDollars(state.outstandingPrincipal),
    nextDueDate: paidOff || !state.nextDueDate ? null : dateOnly(state.nextDueDate),
    delinquency: delinquencyStatus,
    daysPastDue: delinquencyStatus ? state.delinquency.daysPastDue : 0,
    overdue: delinquencyStatus === 'delinquent',
  }
  if (paidOff) {
    data.lifecycle = 'paid_off'
    data.status = 'Paid Off'
  }
  const updated = await tx.loan.update({ where: { loanId }, data })
  if (paidOff) {
    for (const memberId of [loan.borrowerId, loan.cosignerId].filter((id): id is string => id !== null)) {
      await recalcMemberLoanState(tx, memberId)
    }
  }
  return {
    state,
    before: { lifecycle: loan.lifecycle, delinquency: loan.delinquency, daysPastDue: loan.daysPastDue },
    after: { lifecycle: updated.lifecycle, delinquency: updated.delinquency, daysPastDue: updated.daysPastDue },
  }
}
