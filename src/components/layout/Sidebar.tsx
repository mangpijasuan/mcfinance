'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { LayoutDashboard, Users, Receipt, Landmark, CreditCard, History, ArrowDownLeft, Bell, FileText, LogOut, Menu, X, Shield, Wallet, ScrollText } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/dashboard',      label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/members',        label: 'Members',          icon: Users },
  { href: '/contributions',  label: 'Contributions',    icon: Receipt },
  { href: '/loans',          label: 'Loans',            icon: Landmark },
  { href: '/agreements',     label: 'Loan Agreement',   icon: FileText },
  { href: '/loan-payments',  label: 'Loan Payments',    icon: CreditCard },
  { href: '/loan-history',   label: 'Loan History',     icon: History },
  { href: '/withdrawals',    label: 'Withdrawals',      icon: ArrowDownLeft },
  { href: '/payments',       label: 'Pending Payments', icon: Wallet },
  { href: '/notifications',  label: 'Notifications',    icon: Bell },
  { label: 'Sign out',       icon: LogOut, action: 'logout' as const },
]

export default function Sidebar({ adminRole, adminRoleLabel }: { adminRole?: string; adminRoleLabel?: string }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const close = () => setOpen(false)

  const items = adminRole === 'super_admin'
    ? [...nav.slice(0, nav.length - 1), { href: '/settings/admins', label: 'Admin Access', icon: Shield }, { href: '/settings/audit', label: 'Audit Log', icon: ScrollText }, nav[nav.length - 1]]
    : nav

  const NavContent = (compact = false, withDesktopToggle = false) => (
    <>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className={cn('flex items-center min-w-0', compact ? 'justify-center gap-2' : 'justify-start gap-3')}>
          {withDesktopToggle && (
            <button
              onClick={() => setCollapsed(v => !v)}
              className={cn(
                'rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0',
                compact ? 'p-1' : 'p-1.5 -ml-1'
              )}
              aria-label="Toggle sidebar"
            >
              <Menu size={18} />
            </button>
          )}
          <img
            src="/mc-logo.png" alt="Millionaires Club"
            className={cn('shrink-0 object-contain', compact ? 'w-7 h-7' : 'w-8 h-8')}
          />
          {!compact && (
            <div className="min-w-0 text-left">
              <p className="text-white font-semibold text-sm leading-tight truncate">Millionaires Club</p>
              <p className="text-white/40 text-xs">{adminRoleLabel || 'Admin Panel'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {items.map(({ href, label, icon: Icon, action }) => {
          if (action === 'logout') {
            return (
              <button
                key="logout"
                onClick={() => {
                  close()
                  signOut({ callbackUrl: '/login' })
                }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left',
                  compact && 'justify-center',
                  'text-white/55 hover:text-white hover:bg-white/8'
                )}
              >
                <Icon size={16} className="shrink-0" />
                {!compact && label}
              </button>
            )
          }

          const active = path === href || path.startsWith(href + '/')
          return (
            <Link key={href} href={href} onClick={close} className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              compact && 'justify-center',
              active
                ? 'bg-white/15 text-white font-medium'
                : 'text-white/55 hover:text-white hover:bg-white/8'
            )}>
              <Icon size={16} className="shrink-0" />
              {!compact && label}
            </Link>
          )
        })}
      </nav>
    </>
  )

  return (
    <>
      {/* Mobile top bar + hamburger */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-[#1B2A4A] z-40 flex items-center justify-between px-4 border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => setOpen(v => !v)}
            className="p-2 -ml-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Toggle menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <img src="/mc-logo.png" alt="Millionaires Club" className="w-7 h-7 shrink-0 object-contain" />
          <span className="text-white font-semibold text-sm truncate">Millionaires Club</span>
        </div>
        <div className="w-8 shrink-0" />
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button className="absolute inset-0 bg-black/40" onClick={close} aria-label="Close menu" />
          <aside className="relative w-64 max-w-[85vw] min-h-screen bg-[#1B2A4A] flex flex-col shrink-0 shadow-2xl">
            {NavContent(false, false)}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden lg:flex min-h-screen bg-[#1B2A4A] flex-col shrink-0 transition-all duration-200',
        collapsed ? 'w-[72px]' : 'w-56'
      )}>
        {NavContent(collapsed, true)}
      </aside>
    </>
  )
}
