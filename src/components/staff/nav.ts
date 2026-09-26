import {
  LayoutDashboard, Users, Receipt, Landmark, CreditCard, History, ArrowDownLeft, Bell, FileText,
  Shield, Wallet, ScrollText, KeyRound, BookOpen, CheckSquare, type LucideIcon,
} from 'lucide-react'
import type { Permission } from '@/modules/permissions'

export type StaffNavItem = { href: string; label: string; icon: LucideIcon; permission: Permission | null }

// Each admin screen and the permission needed to open it. The APIs behind
// the screens enforce the same permissions; hiding links is convenience.
export const STAFF_NAV: StaffNavItem[] = [
  { href: '/dashboard',       label: 'Dashboard',        icon: LayoutDashboard, permission: 'dashboard.view' },
  { href: '/members',         label: 'Members',          icon: Users,           permission: 'members.read' },
  { href: '/contributions',   label: 'Contributions',    icon: Receipt,         permission: 'contributions.read' },
  { href: '/loans',           label: 'Loans',            icon: Landmark,        permission: 'loans.read' },
  { href: '/agreements',      label: 'Loan Agreement',   icon: FileText,        permission: 'agreements.read' },
  { href: '/loan-payments',   label: 'Loan Payments',    icon: CreditCard,      permission: 'loan_payments.read' },
  { href: '/loan-history',    label: 'Loan History',     icon: History,         permission: 'loans.read' },
  { href: '/withdrawals',     label: 'Withdrawals',      icon: ArrowDownLeft,   permission: 'withdrawals.read' },
  { href: '/payments',        label: 'Pending Payments', icon: Wallet,          permission: 'payments.read' },
  { href: '/approvals',       label: 'Approvals',        icon: CheckSquare,     permission: 'approvals.view' },
  { href: '/ledger',          label: 'Ledger',           icon: BookOpen,        permission: 'ledger.read' },
  { href: '/notifications',   label: 'Notifications',    icon: Bell,            permission: 'notifications.read' },
  { href: '/settings/staff',  label: 'Staff & Roles',    icon: Shield,          permission: 'staff.read' },
  { href: '/settings/audit',  label: 'Audit Log',        icon: ScrollText,      permission: 'audit.read' },
  { href: '/security',        label: 'My Security',      icon: KeyRound,        permission: null },
]

export function visibleNav(permissions: readonly string[]) {
  return STAFF_NAV.filter((item) => item.permission === null || permissions.includes(item.permission))
}

/** Where to send someone after sign-in: their first permitted screen. */
export function landingPath(permissions: readonly string[]) {
  return visibleNav(permissions)[0]?.href ?? '/security'
}
