import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { normalizeAdminRole } from './adminRoles'

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
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null
        const admin = await prisma.admin.findUnique({ where: { email: creds.email } })
        if (!admin) return null
        const ok = await bcrypt.compare(creds.password, admin.password)
        if (!ok) return null
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
      async authorize(creds) {
        if (!creds?.memberId || !creds?.password) return null
        const member = await prisma.member.findUnique({ where: { id: creds.memberId } })
        if (!member || !member.portalEnabled || !member.portalPassword) return null
        const ok = await bcrypt.compare(creds.password, member.portalPassword)
        if (!ok) return null
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
        (session.user as any).role = token.role
        ;(session.user as any).memberId = token.memberId
        ;(session.user as any).adminRole = token.adminRole
      }
      return session
    },
  },
}
