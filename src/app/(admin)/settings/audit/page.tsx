import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/adminRoles'
import AuditLogView from './AuditLogView'

export default async function AuditLogPage() {
  const session = await getServerSession(authOptions)
  if (!isSuperAdminRole((session?.user as any)?.adminRole)) redirect('/dashboard')
  return <AuditLogView />
}
