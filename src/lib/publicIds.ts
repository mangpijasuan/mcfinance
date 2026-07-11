import { randomUUID } from 'crypto'

function compactId() {
  return randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()
}

export function nextPublicId(prefix: string) {
  return `${prefix}-${compactId()}`
}

export function nextMemberId() {
  return `MC-${compactId()}`
}

