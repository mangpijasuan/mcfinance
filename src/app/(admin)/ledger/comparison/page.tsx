import { redirect } from 'next/navigation'
import { can, getPrincipal } from '@/modules/auth'
import ComparisonView from './ComparisonView'

export default async function LedgerComparisonPage() {
  const principal = await getPrincipal()
  if (!can(principal, 'ledger.read')) redirect('/start')
  return <ComparisonView canRun={can(principal, 'ledger.manage_accounts')} />
}
