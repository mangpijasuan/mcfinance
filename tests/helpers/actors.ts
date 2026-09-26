// Who is "signed in" for the next route call. The session only carries
// identity (as in production); roles, MFA state and revocation are read
// from the database by the Data Access Layer, so every staff actor below
// is a real account with a real session row (see createStaffFixtures).
import { ROLE_KEYS, type RoleKey } from '@/modules/permissions'

export type StaffActor = RoleKey | 'staff_no_roles' | 'staff_mfa_pending'
export type Actor = 'anonymous' | 'member' | StaffActor | 'admin'

export const STAFF_ACTORS: StaffActor[] = [...ROLE_KEYS, 'staff_no_roles', 'staff_mfa_pending']
export const ACTORS: Actor[] = ['anonymous', 'member', ...STAFF_ACTORS]

export const staffId = (actor: StaffActor) => `staff-${actor}`
export const staffSid = (actor: StaffActor) => `sid-${actor}`
export const staffEmail = (actor: StaffActor) => `${staffId(actor)}@example.test`

export const TEST_IDS = {
  member: 'MC-TEST-A',
  otherMember: 'MC-TEST-B',
  /** The transitional Club Officer: what every "admin" could do before roles. */
  admin: staffId('club_officer'),
  superAdmin: staffId('super_admin'),
}

function setSession(session: unknown) {
  ;(globalThis as any).__testSession = session
}

export function sessionForStaff(id: string, sid: string) {
  return { user: { id, kind: 'staff', sid, role: 'admin' }, expires: '2999-01-01' }
}

export function signInAs(actor: Actor) {
  if (actor === 'anonymous') return setSession(null)
  if (actor === 'member') return signInAsMember(TEST_IDS.member)
  const staff: StaffActor = actor === 'admin' ? 'club_officer' : actor
  setSession(sessionForStaff(staffId(staff), staffSid(staff)))
}

/** Sign in as a specific member (for ownership checks). */
export function signInAsMember(memberId: string, loginAt = Date.now()) {
  setSession({ user: { id: memberId, kind: 'member', memberId, loginAt, role: 'member' }, expires: '2999-01-01' })
}

/** Sign in with an arbitrary staff session token (session tests). */
export function signInWithStaffSession(adminId: string, sid: string) {
  setSession(sessionForStaff(adminId, sid))
}
