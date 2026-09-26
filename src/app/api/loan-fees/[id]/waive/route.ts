import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { formatUSD, fromBigInt } from '@/lib/money'
import { todayIso } from '@/lib/dates'
import { badRequest, readJsonObject, requiredString } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { submitOrExecute } from '@/modules/approvals'
import { type WaiveInput, checkWaiver } from '@/modules/loans/lifecycle'

// Propose waiving a late fee (the id is the fee's FEE-… number). Always
// needs a second person (D-06: Loan Officer → Treasurer).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('loan_fees.waive')
  if (auth.error) return auth.error

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const reason = requiredString(body.reason)
  if (!reason) return badRequest('Give a reason for the waiver.')
  const input: WaiveInput = { feeId: id, reason, waivedOn: todayIso() }

  try {
    const { fee, loan } = await checkWaiver(prisma, input)
    const amount = fromBigInt(fee.amountCents)
    const out = await submitOrExecute({
      action: 'loan.fee.waive',
      principal: auth.principal,
      req,
      amountCents: amount,
      entityType: 'loan_fee',
      entityId: fee.feeId,
      summary: `Waive the ${formatUSD(amount)} late fee on loan ${loan.loanId} (${loan.borrowerName}), installment ${fee.installmentNumber}. Reason: ${reason}`,
      payload: input,
    })
    if ('queued' in out) return NextResponse.json({ approvalRequest: out.queued }, { status: 202 })
    return NextResponse.json(out.result)
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
