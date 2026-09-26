// Which actions need a second person (D-06), who may propose them, who may
// approve them, and above what amount. Changing this table is a founder
// decision (thresholds, officers); it is code so every change is reviewed.
import type { Permission } from '@/modules/permissions'

export type ApprovalAction = 'payment.zelle.confirm' | 'withdrawal.record' | 'loan.create' | 'journal.manual'

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
