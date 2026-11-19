import { redirect } from 'next/navigation'
import PortalNav from '@/components/portal/PortalNav'
import { getPrincipal } from '@/modules/auth'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Checked against the database: portal access switched off, or a
  // password change, ends the session here and in every portal API.
  const principal = await getPrincipal()
  if (!principal) redirect('/portal/login')
  if (principal.kind !== 'member') redirect('/start')

  return (
    <div className="min-h-screen bg-workspace-canvas print:bg-white">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="contents print:hidden"><PortalNav user={{ memberId: principal.memberId, name: principal.name }} /></div>
      {/* Room at the bottom for the phone tab bar. */}
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 pt-5 pb-28 sm:px-6 lg:pb-14 print:p-0">{children}</main>
    </div>
  )
}
