import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { formatUSD, parseDollars } from '@/lib/money'
import { isIsoDate } from '@/lib/dates'
import { badRequest, readJsonObject } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { submitOrExecute } from '@/modules/approvals'
import { type BankBalanceInput, checkBankBalance, latestBankBalance } from '@/modules/treasury'

// Record the club's bank balance from the bank statement. Until the ledger
// holds the club's cash (M4), it is the cash figure behind the lending
// capacity.
export async function POST(req: NextRequest) {
  const auth = await requirePermission('treasury.record_balance')
  if (auth.error) return auth.error

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  if (!isIsoDate(body.statementDate)) return badRequest('statementDate must be a date (YYYY-MM-DD).')
  let balanceCents
  try {
    balanceCents = parseDollars(String(body.balance ?? '').replace(/^\$/, '').replace(/,/g, ''))
  } catch {
    return badRequest('The balance must be a dollar amount with at most two decimals.')
  }
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
  const input: BankBalanceInput = { statementDate: body.statementDate, balanceCents, note }

  try {
    checkBankBalance(input)
    const previous = await latestBankBalance(prisma, input.statementDate)
    const out = await submitOrExecute({
      action: 'treasury.bank_balance',
      principal: auth.principal,
      req,
      amountCents: balanceCents,
      entityType: 'treasury',
      entityId: 'bank-balance',
      summary: `Bank balance of ${formatUSD(balanceCents)} at the end of ${input.statementDate}${previous ? ` (previous: ${formatUSD(previous.balanceCents)} at ${previous.statementDate})` : ''}${note ? `: ${note}` : ''}`,
      payload: input,
    })
    if ('queued' in out) return NextResponse.json({ approvalRequest: out.queued }, { status: 202 })
    return NextResponse.json(out.result, { status: 201 })
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
