import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PortalNav from '@/components/portal/PortalNav'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/portal/login')
  if ((session.user as any).role !== 'member') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalNav user={session.user as any} />
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
