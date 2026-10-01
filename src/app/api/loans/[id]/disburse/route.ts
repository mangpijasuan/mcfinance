import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { formatUSD, fromBigInt, subtract } from '@/lib/money'
import { isIsoDate } from '@/lib/dates'
import { badRequest, readJsonObject, requiredString } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { submitOrExecute } from '@/modules/approvals'
import { DISBURSEMENT_METHODS, type DisburseInput, checkDisbursement } from '@/modules/loans/lifecycle'

// Record that a loan was paid out, once every party has signed. With
// maker/checker on, a second person (Board) approves it first: 202.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('loans.disburse')
  if (auth.error) return auth.error

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const disbursedOn = requiredString(body.disbursedOn)
  if (!isIsoDate(disbursedOn)) return badRequest('Give the payout date as YYYY-MM-DD.')
  const method = requiredString(body.method)
  if (!method || !(DISBURSEMENT_METHODS as readonly string[]).includes(method)) {
    return badRequest(`Method must be one of: ${DISBURSEMENT_METHODS.join(', ')}.`)
  }
  const input: DisburseInput = { loanId: id, disbursedOn, method, reference: requiredString(body.reference) }

  try {
    const loan = await checkDisbursement(prisma, input)
    const principal = fromBigInt(loan.principalCents!)
    const paidOut = subtract(principal, fromBigInt(loan.applicationFeeCents ?? BigInt(0)))
    const out = await submitOrExecute({
      action: 'loan.disburse',
      principal: auth.principal,
      req,
      amountCents: principal,
      entityType: 'loan',
      entityId: loan.loanId,
      summary: `Pay out loan ${loan.loanId} to ${loan.borrowerName}: ${formatUSD(paidOut)} by ${method} on ${disbursedOn} (${formatUSD(principal)} less the ${formatUSD(subtract(principal, paidOut))} application fee)`,
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
