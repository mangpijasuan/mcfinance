import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { auditContext } from '@/modules/audit'
import { type Cents, parseDollars } from '@/lib/money'
import { badRequest, readJsonObject, requiredString } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { changeDuesPlan } from '@/modules/contributions'
import { isPeriod } from '@/modules/contributions/dues'
import { memberDuesView } from '@/modules/contributions/views'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('contributions.read')
  if (auth.error) return auth.error

  const { id } = await params
  if (!(await prisma.member.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(await memberDuesView(prisma, id, { months: 24 }))
}

// Change the member's monthly dues from a month not yet billed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('dues.manage_plans')
  if (auth.error) return auth.error

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  if (!isPeriod(body.startPeriod)) return badRequest('Give the first month as YYYY-MM.')
  let amountCents: Cents
  try {
    amountCents = parseDollars(typeof body.amount === 'number' ? body.amount : String(body.amount ?? ''))
  } catch {
    return badRequest('Amount must be a dollar amount with at most two decimals.')
  }
  if (!(await prisma.member.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await prisma.$transaction((tx) => changeDuesPlan(
      tx, { memberId: id, amountCents, startPeriod: body.startPeriod, note: requiredString(body.note) },
      auth.principal.id, auditContext(req, auth.principal),
    ))
    return NextResponse.json(await memberDuesView(prisma, id, { months: 24 }), { status: 201 })
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
