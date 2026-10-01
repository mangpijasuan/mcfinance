// Sliding-window limiter for failed sign-in and verification attempts
// (S-5). Attempts are stored in PostgreSQL, so limits survive restarts and
// hold across app instances. Only failures are recorded.
import { prisma } from './prisma'

export type LimitRule = { max: number; windowMs: number }

const MINUTES = 60 * 1000

export const LIMITS = {
  /** Password attempts against one account. */
  account: { max: 8, windowMs: 15 * MINUTES },
  /** Six-digit codes: five tries per 15 minutes makes guessing hopeless. */
  mfa: { max: 5, windowMs: 15 * MINUTES },
  /** Failures from one IP address across all accounts (password spraying). */
  ip: { max: 30, windowMs: 15 * MINUTES },
} satisfies Record<string, LimitRule>

const PRUNE_AFTER_MS = 24 * 60 * MINUTES

export async function isRateLimited(key: string, rule: LimitRule = LIMITS.account): Promise<boolean> {
  const recent = await prisma.rateLimitAttempt.count({
    where: { key, at: { gt: new Date(Date.now() - rule.windowMs) } },
  })
  return recent >= rule.max
}

export async function recordFailedAttempt(...keys: (string | null | undefined)[]) {
  const data = keys.filter((k): k is string => Boolean(k)).map((key) => ({ key }))
  if (data.length === 0) return
  await prisma.rateLimitAttempt.createMany({ data })
  await prisma.rateLimitAttempt.deleteMany({ where: { at: { lt: new Date(Date.now() - PRUNE_AFTER_MS) } } })
}

export async function clearAttempts(key: string) {
  await prisma.rateLimitAttempt.deleteMany({ where: { key } })
}

/** The client address as seen by Caddy (first X-Forwarded-For entry). */
export function clientIp(get: (name: string) => string | null | undefined): string | null {
  const forwarded = get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || get('x-real-ip') || null
}

export const ipKey = (ip: string | null) => (ip ? `ip:${ip}` : null)
