import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'
import { nextPublicId } from '@/lib/publicIds'
import { auditContext, recordAudit } from '@/modules/audit'
import { badRequest, parseDate, readJsonObject, requiredString } from '@/lib/http'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
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
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const memberId = requiredString(body.memberId)
  if (!memberId) return badRequest('A member must be selected.')
  const withdrawalDate = parseDate(body.withdrawalDate)
  if (!withdrawalDate) return badRequest('A valid withdrawal date is required.')
  const amount = parseFloat(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0.' }, { status: 400 })
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      legalName: true,
      archiveLifetime: true,
      contributions2026: true,
      activeAsBorrower: true,
      activeAsCosigner: true,
      currentLoanBalance: true,
    },
  })
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const isFullExit = body.type === 'Full Exit'
  if (isFullExit && (member.activeAsBorrower > 0 || member.activeAsCosigner > 0 || member.currentLoanBalance > 0)) {
    return NextResponse.json(
      { error: 'Member cannot fully exit while they have an active loan or co-signer obligation.' },
      { status: 409 }
    )
  }

  const withdrawal = await prisma.$transaction(async (tx) => {
    const created = await tx.withdrawal.create({
      data: {
        withdrawalId: nextPublicId('WD'),
        memberId,
        memberName: member.legalName,
        amount,
        withdrawalDate,
        type: isFullExit ? 'Full Exit' : 'Partial',
        reason: body.reason || null,
        processedBy: body.processedBy || null,
        notes: body.notes || null,
      },
    })

    // Full exit — mark the member inactive
    if (isFullExit) {
      await tx.member.update({
        where: { id: memberId },
        data: { status: 'Inactive', eligible: 'NO - Inactive' },
      })
    }
    await recordAudit(tx, auditContext(req, auth.session), {
      action: isFullExit ? 'withdrawal.full_exit' : 'withdrawal.create',
      entityType: 'withdrawal', entityId: created.withdrawalId, after: created,
    })
    return created
  })

  return NextResponse.json(withdrawal, { status: 201 })
}
