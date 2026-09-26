import { redirect } from 'next/navigation'
import { can, getPrincipal } from '@/modules/auth'
import LedgerView from './LedgerView'

export default async function LedgerPage() {
  const principal = await getPrincipal()
  if (!can(principal, 'ledger.read')) redirect('/start')
  return <LedgerView canApprove={can(principal, 'ledger.manage_accounts')} />
}
