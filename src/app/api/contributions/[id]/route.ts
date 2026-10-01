import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMemberOrPermission } from '@/modules/auth'
import { receiptView } from '@/modules/contributions/views'

// One contribution as its receipt. A member may read only their own.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMemberOrPermission('contributions.read')
  if (auth.error) return auth.error

  const { id } = await params
  const contribution = await prisma.contribution.findUnique({ where: { transactionId: id } })
  if (!contribution || (auth.principal.kind === 'member' && auth.principal.memberId !== contribution.memberId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(receiptView(contribution))
}
