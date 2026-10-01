import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'

export async function GET() {
  const auth = await requirePermission('ledger.read')
  if (auth.error) return auth.error
  const accounts = await prisma.ledgerAccount.findMany({ orderBy: { code: 'asc' } })
  return NextResponse.json({ accounts })
}
