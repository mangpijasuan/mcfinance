import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { adminRoleLabel, normalizeAdminRole } from '@/lib/adminRoles'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const member = await prisma.member.findUnique({
    where: { id: params.id },
    select: { id: true, legalName: true, email: true, status: true },
  })
  if (!member) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }
  if (!member.email) {
    return NextResponse.json({ error: 'Member must have an email address before being promoted to admin.' }, { status: 400 })
  }

  const existingLinked = await prisma.admin.findFirst({
    where: { linkedMemberId: member.id },
    select: { id: true, email: true, name: true, role: true, linkedMemberId: true, createdAt: true },
  })
  if (existingLinked) {
    return NextResponse.json({
      error: 'This member already has a linked admin account.',
      admin: {
        id: existingLinked.id,
        email: existingLinked.email,
        name: existingLinked.name,
        role: normalizeAdminRole(existingLinked.role),
        roleLabel: adminRoleLabel(existingLinked.role),
        linkedMemberId: existingLinked.linkedMemberId,
        createdAt: existingLinked.createdAt,
      },
    }, { status: 409 })
  }

  const body = await req.json()
  const password = String(body.password || '')
  const role = normalizeAdminRole(body.role)

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const existingEmail = await prisma.admin.findUnique({ where: { email: member.email } })
  if (existingEmail) {
    return NextResponse.json({ error: 'That email already belongs to another admin account.' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const admin = await prisma.admin.create({
    data: {
      email: member.email,
      name: member.legalName,
      password: hashed,
      role,
      linkedMemberId: member.id,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      linkedMemberId: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    ok: true,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: normalizeAdminRole(admin.role),
      roleLabel: adminRoleLabel(admin.role),
      linkedMemberId: admin.linkedMemberId,
      createdAt: admin.createdAt,
    },
  }, { status: 201 })
}
