// Rate limiting (S-5): stored in the database, so it survives restarts;
// limits per account, per IP across accounts, and tighter for MFA codes.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma, resetDatabase } from './helpers/db'
import { TEST_STAFF_PASSWORD, TEST_TOTP_SECRET, createMember, createStaff } from './helpers/factories'
import { authOptions } from '@/lib/auth'
import { LIMITS, isRateLimited, recordFailedAttempt } from '@/lib/rateLimit'
import { currentTotp } from '@/modules/auth/mfa'
import bcrypt from 'bcryptjs'

function authorize(provider: 'admin' | 'member', creds: Record<string, string>, ip = '203.0.113.50') {
  const p = authOptions.providers.find((x: any) => (x.options?.id ?? x.id) === provider) as any
  return p.options.authorize(creds, { headers: { 'x-forwarded-for': ip } })
}

beforeEach(async () => {
  await resetDatabase()
  await createStaff('rl-staff', ['finance'])
})

const email = 'rl-staff@example.test'

describe('account limit', () => {
  it('locks an account after 8 failures, even with the right password', async () => {
    for (let i = 0; i < 8; i++) expect(await authorize('admin', { email, password: 'wrong password' })).toBeNull()
    await expect(authorize('admin', { email, password: TEST_STAFF_PASSWORD })).resolves.toBeNull()
    const blocked = await prisma.auditLog.findFirst({ where: { action: 'auth.login.blocked' }, orderBy: { id: 'desc' } })
    expect(blocked?.actorLabel).toBe(email)
  })

  it('survives a restart (state is in the database, not the process)', async () => {
    for (let i = 0; i < 8; i++) await authorize('admin', { email, password: 'wrong password' })
    vi.resetModules()
    const fresh = await import('@/lib/rateLimit')
    expect(await fresh.isRateLimited(`admin:${email}`)).toBe(true)
  })

  it('forgets failures after a successful sign-in', async () => {
    for (let i = 0; i < 5; i++) await authorize('admin', { email, password: 'wrong password' })
    await expect(authorize('admin', { email, password: TEST_STAFF_PASSWORD })).rejects.toThrow('MFA_REQUIRED')
    // MFA_REQUIRED comes after the password check; complete it to clear the counter.
    expect(await authorize('admin', { email, password: TEST_STAFF_PASSWORD, code: currentTotp(TEST_TOTP_SECRET) })).toBeTruthy()
    expect(await prisma.rateLimitAttempt.count({ where: { key: `admin:${email}` } })).toBe(0)
  })

  it('expires old failures (sliding window)', async () => {
    await prisma.rateLimitAttempt.createMany({
      data: Array.from({ length: 8 }, () => ({ key: `admin:${email}`, at: new Date(Date.now() - 16 * 60 * 1000) })),
    })
    expect(await isRateLimited(`admin:${email}`)).toBe(false)
  })
})

describe('IP limit', () => {
  it('stops one address trying many accounts', async () => {
    for (let i = 0; i < LIMITS.ip.max; i++) {
      await authorize('admin', { email: `nobody-${i}@example.test`, password: 'guess' }, '198.51.100.7')
    }
    // A real account with the right password, from the same address: refused.
    await expect(authorize('admin', { email, password: TEST_STAFF_PASSWORD }, '198.51.100.7')).resolves.toBeNull()
    // The same account from elsewhere still reaches the MFA step.
    await expect(authorize('admin', { email, password: TEST_STAFF_PASSWORD }, '192.0.2.1')).rejects.toThrow('MFA_REQUIRED')
  })

  it('applies to member sign-in too', async () => {
    await createMember('MC-RL', { portalPassword: await bcrypt.hash('member password', 4) })
    await recordFailedAttempt(...Array.from({ length: LIMITS.ip.max }, () => 'ip:198.51.100.8'))
    expect(await authorize('member', { memberId: 'MC-RL', password: 'member password' }, '198.51.100.8')).toBeNull()
    expect(await authorize('member', { memberId: 'MC-RL', password: 'member password' }, '192.0.2.1')).toBeTruthy()
  })
})

describe('MFA limit', () => {
  it('allows only 5 wrong codes per 15 minutes', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(authorize('admin', { email, password: TEST_STAFF_PASSWORD, code: '000000' })).rejects.toThrow('MFA_INVALID')
    }
    // Even the correct code is refused now.
    await expect(authorize('admin', { email, password: TEST_STAFF_PASSWORD, code: currentTotp(TEST_TOTP_SECRET) })).rejects.toThrow('MFA_INVALID')
  })
})

describe('housekeeping', () => {
  it('prunes attempts older than a day', async () => {
    await prisma.rateLimitAttempt.create({ data: { key: 'old', at: new Date(Date.now() - 25 * 60 * 60 * 1000) } })
    await recordFailedAttempt('new')
    expect(await prisma.rateLimitAttempt.findMany({ select: { key: true } })).toEqual([{ key: 'new' }])
  })
})
