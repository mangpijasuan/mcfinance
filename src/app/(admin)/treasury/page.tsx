import { redirect } from 'next/navigation'
import { can, getPrincipal } from '@/modules/auth'
import TreasuryView from './TreasuryView'

export default async function TreasuryPage() {
  const principal = await getPrincipal()
  if (!can(principal, 'treasury.read')) redirect('/start')
  return <TreasuryView canRecord={can(principal, 'treasury.record_balance')} />
}
