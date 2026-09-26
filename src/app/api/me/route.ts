import { NextResponse } from 'next/server'
import { requireStaffSession } from '@/modules/auth'
import { roleLabel } from '@/modules/permissions'

// The signed-in staff member's own identity and permissions, for the UI.
// Works before MFA is complete so the enrolment page can greet them.
export async function GET() {
  const auth = await requireStaffSession()
  if (auth.error) return auth.error
  const p = auth.principal
  return NextResponse.json({
    id: p.id,
    name: p.name,
    email: p.email,
    roles: p.roles,
    roleLabels: p.roles.map(roleLabel),
    permissions: p.mfaVerified ? [...p.permissions].sort() : [],
    mfaEnrolled: p.mfaEnrolled,
    mfaVerified: p.mfaVerified,
  })
}
