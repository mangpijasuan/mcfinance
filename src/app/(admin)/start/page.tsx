import { redirect } from 'next/navigation'
import { getPrincipal } from '@/modules/auth'
import { landingPath } from '@/components/staff/nav'

// After sign-in: the first screen this person's roles allow.
export default async function StartPage() {
  const principal = await getPrincipal()
  if (!principal) redirect('/login')
  if (principal.kind === 'member') redirect('/portal/dashboard')
  if (!principal.mfaVerified) redirect('/security/mfa')
  redirect(landingPath([...principal.permissions]))
}
