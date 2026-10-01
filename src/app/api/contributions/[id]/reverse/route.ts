import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { formatUSD, fromBigInt } from '@/lib/money'
import { badRequest, readJsonObject, requiredString } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { submitOrExecute } from '@/modules/approvals'
import { checkReversal } from '@/modules/contributions'

// Propose reversing a mistaken contribution (the id is its CON-… number).
// Always needs a second person (D-06: Finance → Treasurer).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('contributions.reverse')
  if (auth.error) return auth.error

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const reason = requiredString(body.reason)
  if (!reason) return badRequest('Give a reason for the reversal.')

  try {
    const c = await checkReversal(prisma, { transactionId: id, reason })
    const amount = fromBigInt(c.amountCents)
    const out = await submitOrExecute({
      action: 'contribution.reverse',
      principal: auth.principal,
      req,
      amountCents: amount,
      entityType: 'contribution',
      entityId: c.transactionId,
      summary: `Reverse ${c.receiptNumber ?? c.transactionId}: ${formatUSD(amount)} from ${c.memberName} (${c.memberId}) paid ${c.paymentDate.toISOString().slice(0, 10)}. Reason: ${reason}`,
      payload: { transactionId: c.transactionId, reason },
    })
    if ('queued' in out) return NextResponse.json({ approvalRequest: out.queued }, { status: 202 })
    return NextResponse.json(out.result)
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
