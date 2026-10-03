import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { auditContext } from '@/modules/audit'
import { type Cents, parseDollars } from '@/lib/money'
import { badRequest, readJsonObject } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { type ReconcilingItem, isPeriod, reconcileBank } from '@/modules/accounting/reconciliation'

function dollars(value: unknown): Cents | null {
  try {
    return parseDollars(String(value ?? '').replace(/^\$/, '').replace(/,/g, ''))
  } catch {
    return null
  }
}

// Reconcile a month's bank statement against the ledger (F-11).
export async function POST(req: NextRequest) {
  const auth = await requirePermission('ledger.reconcile')
  if (auth.error) return auth.error

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  if (!isPeriod(body.period)) return badRequest('period must be a month (YYYY-MM).')
  const statementBalanceCents = dollars(body.statementBalance)
  if (statementBalanceCents === null) return badRequest('The statement balance must be a dollar amount with at most two decimals.')
  const raw = Array.isArray(body.items) ? body.items : []
  if (raw.length > 50) return badRequest('At most 50 reconciling items.')
  const items: ReconcilingItem[] = []
  for (const it of raw) {
    const cents = dollars(it?.amount)
    const description = typeof it?.description === 'string' ? it.description.trim().slice(0, 200) : ''
    if (!['deposit_in_transit', 'outstanding_payment'].includes(it?.kind) || !description || cents === null || cents <= 0) {
      return badRequest('Each item needs a kind (deposit in transit or outstanding payment), a description and an amount above zero.')
    }
    items.push({ kind: it.kind, description, cents })
  }
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null

  try {
    const result = await prisma.$transaction((tx) => reconcileBank(tx, { period: body.period, statementBalanceCents, items, note }, auth.principal.id, auditContext(req, auth.principal)))
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
