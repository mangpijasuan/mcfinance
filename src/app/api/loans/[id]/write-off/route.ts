import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { formatUSD } from '@/lib/money'
import { todayIso } from '@/lib/dates'
import { badRequest, readJsonObject, requiredString } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { submitOrExecute } from '@/modules/approvals'
import { type WriteOffInput, checkWriteOff } from '@/modules/loans/lifecycle'

// Propose writing off a delinquent loan. Always needs two Board approvals
// (D-06); the write-off posts Dr 5100 Loan losses / Cr 1100 and 1110.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('loans.write_off')
  if (auth.error) return auth.error

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const reason = requiredString(body.reason)
  if (!reason) return badRequest('Give a reason for the write-off.')
  const input: WriteOffInput = { loanId: id, reason, chargedOffOn: todayIso() }

  try {
    const { loan, state } = await checkWriteOff(prisma, input)
    const out = await submitOrExecute({
      action: 'loan.write_off',
      principal: auth.principal,
      req,
      amountCents: state.payoff,
      entityType: 'loan',
      entityId: loan.loanId,
      summary: `Write off loan ${loan.loanId} (${loan.borrowerName}): ${formatUSD(state.payoff)} unpaid, ${state.delinquency.daysPastDue} days past due. Reason: ${reason}`,
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
