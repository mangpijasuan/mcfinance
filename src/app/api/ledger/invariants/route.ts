import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { checkInvariants } from '@/modules/accounting/ledger'

export async function GET() {
  const auth = await requirePermission('ledger.read')
  if (auth.error) return auth.error
  return NextResponse.json(await checkInvariants(prisma))
}
