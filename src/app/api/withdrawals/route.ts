import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { cents, formatUSD, parseDollars, toLegacyDollars } from '@/lib/money'
import { operationErrorResponse } from '@/lib/operationError'
import { submitOrExecute } from '@/modules/approvals'
import { checkWithdrawal, type WithdrawalInput } from '@/modules/membership/withdrawals'
import { badRequest, parseDate, readJsonObject, requiredString } from '@/lib/http'

export async function GET(req: NextRequest) {
  const auth = await requirePermission('withdrawals.read')
  if (auth.error) return auth.error

  const s      = new URL(req.url).searchParams
  const search = s.get('search') || ''
  const type   = s.get('type') || ''
  const page   = Math.max(1, parseInt(s.get('page') || '1'))
  const limit  = parseInt(s.get('limit') || '50')

  const where: any = {}
  if (search) where.OR = [
    { memberName: { contains: search, mode: 'insensitive' } },
    { memberId:   { contains: search, mode: 'insensitive' } },
  ]
  if (type) where.type = type

  const [withdrawals, total] = await Promise.all([
    prisma.withdrawal.findMany({ where, orderBy: { withdrawalDate: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.withdrawal.count({ where }),
  ])
  const totalAmount = await prisma.withdrawal.aggregate({ where, _sum: { amount: true } })

  return NextResponse.json({ withdrawals, total, totalAmount: totalAmount._sum.amount ?? 0, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('withdrawals.record')
  if (auth.error) return auth.error

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const memberId = requiredString(body.memberId)
  if (!memberId) return badRequest('A member must be selected.')
  const withdrawalDate = parseDate(body.withdrawalDate)
  if (!withdrawalDate) return badRequest('A valid withdrawal date is required.')
  let amountCents: number
  try {
    amountCents = parseDollars(typeof body.amount === 'number' ? body.amount : String(body.amount ?? ''))
  } catch {
    return badRequest('Amount must be a dollar amount with at most two decimals.')
  }
  if (amountCents <= 0) return badRequest('Amount must be greater than 0.')

  const input: WithdrawalInput = {
    memberId,
    amount: toLegacyDollars(cents(amountCents)),
    withdrawalDate: withdrawalDate.toISOString(),
    type: body.type === 'Full Exit' ? 'Full Exit' : 'Partial',
    reason: body.reason || null,
    processedBy: body.processedBy || null,
    notes: body.notes || null,
  }

  try {
    const member = await checkWithdrawal(prisma, input)
    const out = await submitOrExecute({
      action: 'withdrawal.record',
      principal: auth.principal,
      req,
      amountCents,
      entityType: 'member',
      entityId: memberId,
      summary: `${input.type === 'Full Exit' ? 'Full exit' : 'Partial withdrawal'}: ${formatUSD(cents(amountCents))} to ${member.legalName} (${memberId})`,
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
