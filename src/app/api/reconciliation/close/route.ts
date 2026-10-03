import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { auditContext } from '@/modules/audit'
import { badRequest, readJsonObject } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { closePeriod, isPeriod } from '@/modules/accounting/reconciliation'

// Close a month once it is reconciled (F-11). Closed months never reopen.
export async function POST(req: NextRequest) {
  const auth = await requirePermission('ledger.close_period')
  if (auth.error) return auth.error

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  if (!isPeriod(body.period)) return badRequest('period must be a month (YYYY-MM).')
  try {
    const result = await prisma.$transaction((tx) => closePeriod(tx, body.period, auth.principal.id, auditContext(req, auth.principal)), { timeout: 60_000 })
    return NextResponse.json(result)
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
