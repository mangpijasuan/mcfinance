import { redirect } from 'next/navigation'
import { can, getPrincipal } from '@/modules/auth'
import DuesView from './DuesView'

export default async function DuesPage() {
  const principal = await getPrincipal()
  if (!can(principal, 'contributions.read')) redirect('/start')
  return <DuesView />
}
