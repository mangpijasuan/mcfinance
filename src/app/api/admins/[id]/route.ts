import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { adminRoleLabel, isSuperAdminRole, normalizeAdminRole } from '@/lib/adminRoles'
import { requireSuperAdmin } from '@/lib/apiAuth'

function safeAdmin(admin: { id: string; email: string; name: string; role: string; createdAt: Date; linkedMemberId?: string | null }) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: normalizeAdminRole(admin.role),
    roleLabel: adminRoleLabel(admin.role),
    linkedMemberId: admin.linkedMemberId ?? null,
    createdAt: admin.createdAt,
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const body = await req.json()
  const existing = await prisma.admin.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Admin not found.' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).trim()
  if (body.email !== undefined) data.email = String(body.email).trim().toLowerCase()
  if (body.role !== undefined) data.role = normalizeAdminRole(body.role)
  if (body.password) {
    const password = String(body.password)
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }
    data.password = await bcrypt.hash(password, 10)
  }

  const nextRole = normalizeAdminRole((data.role as string | undefined) ?? existing.role)
  const actingAdminId = String((auth.session.user as any).id || '')
  const roleIsChangingFromSuperAdmin = isSuperAdminRole(existing.role) && !isSuperAdminRole(nextRole)

  if (existing.id === actingAdminId && !isSuperAdminRole(nextRole)) {
    return NextResponse.json({ error: 'You cannot demote your own Super Admin account.' }, { status: 409 })
  }
  if (roleIsChangingFromSuperAdmin) {
    const superAdminCount = await prisma.admin.count({ where: { role: 'super_admin' } })
    if (superAdminCount <= 1) {
      return NextResponse.json({ error: 'At least one Super Admin account must remain.' }, { status: 409 })
    }
  }

  if (existing.email !== data.email && data.email) {
    const sameEmail = await prisma.admin.findUnique({ where: { email: data.email as string } })
    if (sameEmail && sameEmail.id !== existing.id) {
      return NextResponse.json({ error: 'Another admin already uses that email.' }, { status: 409 })
    }
  }

  const updated = await prisma.admin.update({
    where: { id: params.id },
    data,
    select: { id: true, email: true, name: true, role: true, linkedMemberId: true, createdAt: true },
  })

  return NextResponse.json(safeAdmin(updated))
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const existing = await prisma.admin.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Admin not found.' }, { status: 404 })

  const actingAdminId = String((auth.session.user as any).id || '')
  if (existing.id === actingAdminId) {
    return NextResponse.json({ error: 'You cannot delete your own active account.' }, { status: 409 })
  }

  if (isSuperAdminRole(existing.role)) {
    const superAdminCount = await prisma.admin.count({ where: { role: 'super_admin' } })
    if (superAdminCount <= 1) {
      return NextResponse.json({ error: 'At least one Super Admin account must remain.' }, { status: 409 })
    }
  }

  await prisma.admin.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
