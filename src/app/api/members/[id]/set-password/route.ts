import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/apiAuth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const { password, enabled } = await req.json()

  if (password && String(password).length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }

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
