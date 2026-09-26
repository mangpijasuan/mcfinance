import { redirect } from 'next/navigation'
import { getPrincipal } from '@/modules/auth'
import MfaEnrolment from './MfaEnrolment'

// Two-factor setup, required before any staff screen opens (D-07).
export default async function MfaSetupPage() {
  const principal = await getPrincipal()
  if (!principal) redirect('/login')
  if (principal.kind !== 'staff') redirect('/portal/dashboard')
  if (principal.mfaVerified) redirect('/security')
  return <MfaEnrolment name={principal.name} email={principal.email} />
}
