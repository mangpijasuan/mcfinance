export function sanitizeMember<T extends Record<string, any>>(member: T) {
  const { portalPassword, ...safe } = member
  return safe
}

