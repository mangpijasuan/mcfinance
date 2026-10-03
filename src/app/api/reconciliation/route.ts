import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { reconciliationStatus } from '@/modules/accounting/reconciliation'

// Clearing accounts, collector cash, transfers and month-end status (F-11).
export async function GET() {
  const auth = await requirePermission('ledger.read')
  if (auth.error) return auth.error
  return NextResponse.json(await reconciliationStatus(prisma))
}
