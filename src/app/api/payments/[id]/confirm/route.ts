import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { fromLegacyDollars, formatUSD } from '@/lib/money'
import { operationErrorResponse } from '@/lib/operationError'
import { submitOrExecute } from '@/modules/approvals'

// Confirming a Zelle claim records the member's payment. Above the D-06
// threshold (with maker/checker switched on) it is queued for a second
// person instead: 202 with the approval request.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('payments.review')
  if (auth.error) return auth.error

  const { id } = await params
  const payment = await prisma.portalPayment.findUnique({ where: { id } })
  if (!payment) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
  if (payment.method !== 'zelle') {
    return NextResponse.json({ error: 'Only Zelle claims are confirmed manually.' }, { status: 400 })
  }
  if (payment.status !== 'pending') {
    return NextResponse.json({ error: 'This payment has already been reviewed.' }, { status: 409 })
  }

  const amountCents = fromLegacyDollars(payment.amount)
  try {
    const out = await submitOrExecute({
      action: 'payment.zelle.confirm',
      principal: auth.principal,
      req,
      amountCents,
      entityType: 'portal_payment',
      entityId: payment.id,
      summary: `Confirm Zelle claim ${payment.publicId}: ${formatUSD(amountCents)} ${payment.type === 'contribution' ? 'contribution' : `loan payment (${payment.loanId})`} from member ${payment.memberId}`,
      payload: { paymentId: payment.id },
    })
    if ('queued' in out) return NextResponse.json({ approvalRequest: out.queued }, { status: 202 })
    return NextResponse.json(out.result)
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
