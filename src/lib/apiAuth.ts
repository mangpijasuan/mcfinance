import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from './auth'
import { isSuperAdminRole } from './adminRoles'

type AppSession = Awaited<ReturnType<typeof getServerSession>>

export async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { session }
}

export async function requireSuperAdmin() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!isSuperAdminRole((session.user as any)?.adminRole)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session }
}

export async function requireAnySession() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { session }
}

export async function requireMember() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'member') {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { session }
}

export function sessionMemberId(session: AppSession) {
  return (session as any)?.user?.memberId as string | undefined
}

export function sessionAdminRole(session: AppSession) {
  return (session as any)?.user?.adminRole as string | undefined
}
