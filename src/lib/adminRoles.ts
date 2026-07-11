export type AdminRole = 'admin' | 'super_admin'

export function normalizeAdminRole(role?: string | null): AdminRole {
  return role === 'super_admin' ? 'super_admin' : 'admin'
}

export function isSuperAdminRole(role?: string | null) {
  return normalizeAdminRole(role) === 'super_admin'
}

export function adminRoleLabel(role?: string | null) {
  return isSuperAdminRole(role) ? 'Super Admin' : 'Admin'
}
