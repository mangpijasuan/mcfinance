// Who is "signed in" for the next route call. Mirrors the session shape
// produced by the NextAuth callbacks in src/lib/auth.ts.
export type Actor = 'anonymous' | 'member' | 'admin' | 'super_admin'

export const ACTORS: Actor[] = ['anonymous', 'member', 'admin', 'super_admin']

export const TEST_IDS = {
  member: 'MC-TEST-A',
  otherMember: 'MC-TEST-B',
  admin: 'admin-test',
  superAdmin: 'super-admin-test',
}

export function sessionFor(actor: Actor) {
  switch (actor) {
    case 'anonymous':
      return null
    case 'member':
      return { user: { id: TEST_IDS.member, name: 'Member A', email: 'a@example.test', role: 'member', memberId: TEST_IDS.member }, expires: '2999-01-01' }
    case 'admin':
      return { user: { id: TEST_IDS.admin, name: 'Admin', email: 'admin@example.test', role: 'admin', adminRole: 'admin' }, expires: '2999-01-01' }
    case 'super_admin':
      return { user: { id: TEST_IDS.superAdmin, name: 'Super Admin', email: 'super@example.test', role: 'admin', adminRole: 'super_admin' }, expires: '2999-01-01' }
  }
}

export function signInAs(actor: Actor) {
  ;(globalThis as any).__testSession = sessionFor(actor)
}

/** Sign in as a specific member (for ownership checks). */
export function signInAsMember(memberId: string) {
  ;(globalThis as any).__testSession = {
    user: { id: memberId, name: memberId, email: '', role: 'member', memberId },
    expires: '2999-01-01',
  }
}
