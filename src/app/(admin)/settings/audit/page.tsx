import { redirect } from 'next/navigation'
import { can, getPrincipal } from '@/modules/auth'
import AuditLogView from './AuditLogView'

export default async function AuditLogPage() {
  if (!can(await getPrincipal(), 'audit.read')) redirect('/start')
  return <AuditLogView />
}
