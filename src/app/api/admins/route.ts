import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { adminRoleLabel, normalizeAdminRole } from '@/lib/adminRoles'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { auditContext, recordAudit } from '@/modules/audit'

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

export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const admins = await prisma.admin.findMany({
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, email: true, name: true, role: true, linkedMemberId: true, createdAt: true },
  })

  return NextResponse.json({ admins: admins.map(safeAdmin) })
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const name = String(body.name || '').trim()
  const password = String(body.password || '')
  const role = normalizeAdminRole(body.role)

  if (!email || !name || !password) {
    return NextResponse.json({ error: 'Name, email, and password are required.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const existing = await prisma.admin.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'An admin with that email already exists.' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const admin = await prisma.$transaction(async (tx) => {
    const created = await tx.admin.create({
      data: { email, name, password: hashed, role },
      select: { id: true, email: true, name: true, role: true, linkedMemberId: true, createdAt: true },
    })
    await recordAudit(tx, auditContext(req, auth.session), {
      action: 'admin.create', entityType: 'admin', entityId: created.id, after: created,
    })
    return created
  })

  return NextResponse.json(safeAdmin(admin), { status: 201 })
}
