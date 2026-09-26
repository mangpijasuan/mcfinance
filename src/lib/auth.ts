import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { normalizeAdminRole } from './adminRoles'
import { isRateLimited, recordFailedAttempt, clearAttempts } from './rateLimit'
import { anonymousAuditContext, auditContext, recordAudit } from '@/modules/audit'

// NextAuth hands authorize() a plain header object.
function headerSource(req: { headers?: Record<string, any> } | undefined) {
  return { headers: { get: (name: string) => (req?.headers?.[name] as string | undefined) ?? null } }
}

async function auditLogin(
  req: { headers?: Record<string, any> } | undefined,
  outcome: 'success' | 'failure' | 'blocked',
  kind: 'admin' | 'member',
  attempted: string,
  user?: { id: string; email?: string | null; memberId?: string },
) {
  const ctx = user
    ? auditContext(headerSource(req), { user: { ...user, role: kind } })
    : anonymousAuditContext(attempted, headerSource(req))
  await recordAudit(prisma, ctx, {
    action: `auth.login.${outcome}`,
    entityType: kind,
    entityId: user?.id ?? attempted.slice(0, 200),
  }).catch((err) => console.error('audit: failed to record login', err))
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    // Admin login (email + password)
    CredentialsProvider({
      id: 'admin',
      name: 'Admin',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds, req) {
        if (!creds?.email || !creds?.password) return null
        const email = creds.email.trim().toLowerCase()
        const rateLimitKey = `admin:${email}`
        if (isRateLimited(rateLimitKey)) { await auditLogin(req, 'blocked', 'admin', email); return null }
        const admin = await prisma.admin.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
        if (!admin) { recordFailedAttempt(rateLimitKey); await auditLogin(req, 'failure', 'admin', email); return null }
        const ok = await bcrypt.compare(creds.password, admin.password)
        if (!ok) { recordFailedAttempt(rateLimitKey); await auditLogin(req, 'failure', 'admin', email); return null }
        clearAttempts(rateLimitKey)
        await auditLogin(req, 'success', 'admin', email, { id: admin.id, email: admin.email })
        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: 'admin',
          adminRole: normalizeAdminRole(admin.role),
        }
      },
    }),
    // Member login (member ID + password)
    CredentialsProvider({
      id: 'member',
      name: 'Member',
      credentials: {
        memberId: { label: 'Member ID', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds, req) {
        if (!creds?.memberId || !creds?.password) return null
        const attempted = creds.memberId.trim()
        const rateLimitKey = `member:${attempted.toLowerCase()}`
        if (isRateLimited(rateLimitKey)) { await auditLogin(req, 'blocked', 'member', attempted); return null }
        const member = await prisma.member.findUnique({ where: { id: attempted } })
        if (!member || !member.portalEnabled || !member.portalPassword) { recordFailedAttempt(rateLimitKey); await auditLogin(req, 'failure', 'member', attempted); return null }
        const ok = await bcrypt.compare(creds.password, member.portalPassword)
        if (!ok) { recordFailedAttempt(rateLimitKey); await auditLogin(req, 'failure', 'member', attempted); return null }
        clearAttempts(rateLimitKey)
        await auditLogin(req, 'success', 'member', attempted, { id: member.id, memberId: member.id })
        return {
          id: member.id,
          email: member.email || '',
          name: member.legalName,
          role: 'member',
          memberId: member.id,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.memberId = (user as any).memberId
        token.adminRole = (user as any).adminRole
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        // The admin's or member's own id — used for self-protection checks and audit actors.
        (session.user as any).id = token.sub
        ;(session.user as any).role = token.role
        ;(session.user as any).memberId = token.memberId
        ;(session.user as any).adminRole = token.adminRole
      }
      return session
    },
  },
}
