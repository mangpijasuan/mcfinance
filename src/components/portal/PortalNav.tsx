'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'

export default function PortalNav({ user }: { user: { name?: string; memberId?: string } }) {
  const path = usePathname()
  const nav = [
    { href: '/portal/dashboard',    label: 'My Dashboard' },
    { href: '/portal/pay',          label: 'Make a Payment' },
    { href: '/portal/history',      label: 'Payment History' },
    { href: '/portal/agreements',   label: 'Loan Application' },
  ]

  return (
    <header className="bg-[#1B2A4A] shadow-sm">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center text-[#1B2A4A] font-bold text-xs">MC</div>
            <span className="text-white font-semibold text-sm hidden sm:block">Millionaires Club</span>
          </div>
          <nav className="flex items-center gap-1">
            {nav.map(item => (
              <Link key={item.href} href={item.href} className={cn(
                'px-3 py-1.5 rounded-lg text-sm transition-colors',
                path === item.href ? 'bg-white/15 text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/8'
              )}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-xs hidden sm:block">{user.memberId} · {user.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/portal/login' })}
            className="text-white/60 hover:text-white text-xs px-3 py-1.5 rounded-lg hover:bg-white/8 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
