import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { auditContext, recordAudit } from '@/modules/audit'
import { comparisonStatus, runLedgerComparison } from '@/modules/accounting/comparison'

// The nightly comparison of the ledger with the old records (M5).
export async function GET() {
  const auth = await requirePermission('ledger.read')
  if (auth.error) return auth.error
  return NextResponse.json(await comparisonStatus(prisma))
}

// Run it now (after fixing a difference, say). Recorded like the nightly run.
export async function POST(req: NextRequest) {
  const auth = await requirePermission('ledger.manage_accounts')
  if (auth.error) return auth.error
  const run = await runLedgerComparison(prisma)
  if (!run) return NextResponse.json({ error: 'Opening balances are not posted yet (M4): nothing to compare.' }, { status: 409 })
  await recordAudit(prisma, auditContext(req, auth.principal), {
    action: 'ledger.comparison.run', entityType: 'ledger', entityId: run.runDate,
    metadata: { ok: run.ok, differences: run.differences, emailedTo: run.emailedTo },
  })
  return NextResponse.json(await comparisonStatus(prisma))
}
