import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/apiAuth'
import { badRequest, notFound, readJsonObject } from '@/lib/http'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const { password, enabled } = body

  if (password !== undefined && password !== '' && (typeof password !== 'string' || password.length < 8)) {
    return badRequest('Password must be at least 8 characters.')
  }
  const existing = await prisma.member.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return notFound('Member not found.')

  const data: any = {}
  if (typeof enabled === 'boolean') data.portalEnabled = enabled
  if (password) data.portalPassword = await bcrypt.hash(password, 10)
  if (password && enabled === undefined) data.portalEnabled = true

  const member = await prisma.member.update({
    where: { id },
    data,
    select: { id: true, legalName: true, portalEnabled: true },
  })

  return NextResponse.json(member)
}
