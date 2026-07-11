import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import { adminRoleLabel } from '@/lib/adminRoles'
import AdminTopbar from '@/components/layout/AdminTopbar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if ((session.user as any).role !== 'admin') redirect('/portal/dashboard')
  const roleLabel = adminRoleLabel((session.user as any).adminRole)

  return (
    <div className="flex min-h-screen">
      <Sidebar adminRole={(session.user as any).adminRole} adminRoleLabel={roleLabel} />
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        <AdminTopbar adminRoleLabel={roleLabel} />
        {children}
      </main>
    </div>
  )
}
