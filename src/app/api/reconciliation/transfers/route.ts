import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { formatUSD, parseDollars } from '@/lib/money'
import { isIsoDate } from '@/lib/dates'
import { badRequest, readJsonObject } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { submitOrExecute } from '@/modules/approvals'
import { CLEARING_ACCOUNTS, type TransferInput, checkTransfer, isClearingAccount } from '@/modules/accounting/reconciliation'

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

// Record money moved from a clearing account to the bank (F-11).
export async function POST(req: NextRequest) {
  const auth = await requirePermission('treasury.record_transfer')
  if (auth.error) return auth.error

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  if (!isClearingAccount(body.fromAccount)) return badRequest('fromAccount must be 1010 (Stripe), 1020 (Zelle / bank transfer) or 1030 (cash held by collectors).')
  if (!isIsoDate(body.bankDate)) return badRequest('bankDate must be a date (YYYY-MM-DD).')
  let amountCents
  try {
    amountCents = parseDollars(String(body.amount ?? '').replace(/^\$/, '').replace(/,/g, ''))
  } catch {
    return badRequest('The amount must be a dollar amount with at most two decimals.')
  }
  const input: TransferInput = {
    fromAccount: body.fromAccount, amountCents, bankDate: body.bankDate,
    reference: text(body.reference, 120), collector: body.fromAccount === '1030' ? text(body.collector, 120) : null, note: text(body.note, 500),
  }

  try {
    await checkTransfer(prisma, input)
    const out = await submitOrExecute({
      action: 'treasury.clearing_transfer',
      principal: auth.principal,
      req,
      amountCents,
      entityType: 'ledger',
      entityId: input.fromAccount,
      summary: `${formatUSD(amountCents)} from ${CLEARING_ACCOUNTS[input.fromAccount]}${input.collector ? ` (${input.collector})` : ''} reached the bank on ${input.bankDate}${input.reference ? `, ref ${input.reference}` : ''}`,
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
