import { redirect } from 'next/navigation'
import { can, getPrincipal } from '@/modules/auth'
import { todayIso } from '@/lib/dates'
import TreasuryView from './TreasuryView'

export default async function TreasuryPage() {
  const principal = await getPrincipal()
  if (!can(principal, 'treasury.read')) redirect('/start')
  // Today in the club's time zone, so the form never defaults to tomorrow.
  return <TreasuryView canRecord={can(principal, 'treasury.record_balance')} today={todayIso()} />
}
