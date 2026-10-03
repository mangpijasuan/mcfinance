import { redirect } from 'next/navigation'
import { can, getPrincipal } from '@/modules/auth'
import { todayIso } from '@/lib/dates'
import ReconciliationView from './ReconciliationView'

export default async function ReconciliationPage() {
  const principal = await getPrincipal()
  if (!can(principal, 'ledger.read')) redirect('/start')
  return (
    <ReconciliationView
      today={todayIso()}
      canTransfer={can(principal, 'treasury.record_transfer')}
      canReconcile={can(principal, 'ledger.reconcile')}
      canClose={can(principal, 'ledger.close_period')}
    />
  )
}
