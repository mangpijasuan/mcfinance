import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest } from '@/lib/http'
import { requirePermission } from '@/modules/auth'
import { trialBalance } from '@/modules/accounting/ledger'

// Amounts are integer cents.
export async function GET(req: NextRequest) {
  const auth = await requirePermission('ledger.read')
  if (auth.error) return auth.error
  const asOf = new URL(req.url).searchParams.get('asOf') || undefined
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return badRequest('asOf must be YYYY-MM-DD.')
  return NextResponse.json(await trialBalance(prisma, asOf))
}
