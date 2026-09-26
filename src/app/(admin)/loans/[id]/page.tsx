import { redirect } from 'next/navigation'
import { can, getPrincipal } from '@/modules/auth'
import LoanDetail from './LoanDetail'

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await getPrincipal()
  if (!can(principal, 'loans.read')) redirect('/start')
  const { id } = await params
  return (
    <LoanDetail
      id={id}
      can={{
        disburse: can(principal, 'loans.disburse'),
        waive: can(principal, 'loan_fees.waive'),
        writeOff: can(principal, 'loans.write_off'),
      }}
    />
  )
}
