// Which actions need a second person (D-06), who may propose them, who may
// approve them, and above what amount. Changing this table is a founder
// decision (thresholds, officers); it is code so every change is reviewed.
import type { Permission } from '@/modules/permissions'

export type ApprovalAction =
  | 'payment.zelle.confirm' | 'withdrawal.record' | 'loan.create' | 'journal.manual'
  | 'loan.disburse' | 'loan.fee.waive' | 'loan.write_off' | 'contribution.reverse' | 'ledger.opening_balances'
  | 'treasury.bank_balance'

type Policy = {
  label: string
  /** Who may propose it (the maker). */
  makerPermission: Permission
  /** Who may approve it — always someone other than the maker. */
  checkerPermission: Permission
  /** Needs approval only above this amount (cents); null = always. */
  thresholdCents: number | null
  approvalsRequired: number
  /**
   * Existing actions are only held for approval once maker/checker is
   * switched on (after the officers are named, Gate #1 A4). New ones that
   * never worked any other way are always held.
   */
  alwaysEnforced: boolean
}

export const APPROVAL_POLICIES: Record<ApprovalAction, Policy> = {
  'payment.zelle.confirm': {
    label: 'Confirm a Zelle claim',
    makerPermission: 'payments.review',
    checkerPermission: 'payments.review',
    thresholdCents: 100_00, // D-06: single sign-off up to $100, two above
    approvalsRequired: 1,
    alwaysEnforced: false,
  },
  'withdrawal.record': {
    label: 'Pay out a withdrawal',
    makerPermission: 'withdrawals.record',
    checkerPermission: 'withdrawals.approve',
    thresholdCents: null,
    approvalsRequired: 1,
    alwaysEnforced: false,
  },
  'loan.create': {
    label: 'Approve a loan',
    makerPermission: 'loans.create',
    checkerPermission: 'loans.approve',
    thresholdCents: null,
    approvalsRequired: 1,
    alwaysEnforced: false,
  },
  'journal.manual': {
    label: 'Post a manual journal entry',
    makerPermission: 'ledger.propose',
    checkerPermission: 'ledger.approve',
    thresholdCents: null,
    approvalsRequired: 1,
    alwaysEnforced: true,
  },
  // Paying out a loan is part of the everyday loan flow (the money was
  // always paid out, just never recorded), so it follows the same switch
  // as approving the loan. D-06: Treasurer records, Board approves.
  'loan.disburse': {
    label: 'Pay out a loan',
    makerPermission: 'loans.disburse',
    checkerPermission: 'loans.approve_disbursement',
    thresholdCents: null,
    approvalsRequired: 1,
    alwaysEnforced: false,
  },
  // Waivers and write-offs reduce what a member owes and never existed
  // before, so they always need a second person. D-06: Loan Officer →
  // Treasurer for waivers; Treasurer → two Board approvals for write-offs.
  'loan.fee.waive': {
    label: 'Waive a late fee',
    makerPermission: 'loan_fees.waive',
    checkerPermission: 'loan_fees.approve_waiver',
    thresholdCents: null,
    approvalsRequired: 1,
    alwaysEnforced: true,
  },
  'loan.write_off': {
    label: 'Write off a loan',
    makerPermission: 'loans.write_off',
    checkerPermission: 'loans.approve_write_off',
    thresholdCents: null,
    approvalsRequired: 2,
    alwaysEnforced: true,
  },
  // Correcting a recorded contribution is an adjustment (D-06: Finance →
  // Treasurer). It never existed before, so it always needs a checker.
  // Opening balances (M4) start the club's books: the Treasurer proposes,
  // a second person holding ledger approval checks the report and approves.
  'ledger.opening_balances': {
    label: 'Post the opening balances',
    makerPermission: 'ledger.manage_accounts',
    checkerPermission: 'ledger.approve',
    thresholdCents: null,
    approvalsRequired: 1,
    alwaysEnforced: true,
  },
  'contribution.reverse': {
    label: 'Reverse a contribution',
    makerPermission: 'contributions.reverse',
    checkerPermission: 'contributions.approve_reversal',
    thresholdCents: null,
    approvalsRequired: 1,
    alwaysEnforced: true,
  },
  // The cash figure behind the lending capacity (Gate #1 A10). Recording
  // the bank balance is everyday Treasurer work, so it follows the
  // maker/checker switch; once on, a Board member confirms it.
  'treasury.bank_balance': {
    label: 'Record the bank balance',
    makerPermission: 'treasury.record_balance',
    checkerPermission: 'treasury.approve_balance',
    thresholdCents: null,
    approvalsRequired: 1,
    alwaysEnforced: false,
  },
}

/** Maker/checker for existing actions: off until the officers are named (Gate #1 A4). */
export function makerCheckerEnforced(): boolean {
  return process.env.MAKER_CHECKER_ENFORCED === 'true'
}

export function needsApproval(action: ApprovalAction, amountCents: number | null): boolean {
  const policy = APPROVAL_POLICIES[action]
  if (!policy.alwaysEnforced && !makerCheckerEnforced()) return false
  if (policy.thresholdCents === null) return true
  return (amountCents ?? 0) > policy.thresholdCents
}
