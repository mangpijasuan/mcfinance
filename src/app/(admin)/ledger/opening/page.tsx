import { redirect } from 'next/navigation'
import { can, getPrincipal } from '@/modules/auth'
import OpeningView from './OpeningView'

export default async function OpeningBalancesPage() {
  const principal = await getPrincipal()
  if (!can(principal, 'ledger.read')) redirect('/start')
  return <OpeningView canPropose={can(principal, 'ledger.manage_accounts')} />
}
