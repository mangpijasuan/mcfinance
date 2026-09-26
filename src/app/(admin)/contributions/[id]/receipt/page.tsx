import { redirect } from 'next/navigation'
import { can, getPrincipal } from '@/modules/auth'
import Receipt from '@/components/contributions/Receipt'

export default async function ContributionReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await getPrincipal()
  if (!can(principal, 'contributions.read')) redirect('/start')
  const { id } = await params
  return <Receipt id={id} backHref="/contributions" />
}
