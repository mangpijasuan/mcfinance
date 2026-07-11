import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/apiAuth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { password, enabled } = await req.json()

  const data: any = {}
  if (typeof enabled === 'boolean') data.portalEnabled = enabled
  if (password) data.portalPassword = await bcrypt.hash(password, 10)
  if (password && enabled === undefined) data.portalEnabled = true

  const member = await prisma.member.update({
    where: { id: params.id },
    data,
    select: { id: true, legalName: true, portalEnabled: true },
  })

  return NextResponse.json(member)
}
