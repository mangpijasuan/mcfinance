import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'
import { badRequest, notFound, parseDate, readJsonObject } from '@/lib/http'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const loan = await prisma.loan.findUnique({
    where: { loanId: id },
    include: {
      payments: { orderBy: { paymentDate: 'desc' } },
      borrower: { select: { id: true, legalName: true, email: true, status: true } },
    },
  })
  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(loan)
}

const EDITABLE_LOAN_FIELDS = ['notes', 'status', 'overdue'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const existing = await prisma.loan.findUnique({ where: { loanId: id }, select: { loanId: true } })
  if (!existing) return notFound()

  const data: Record<string, unknown> = {}
  for (const field of EDITABLE_LOAN_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field]
  }
  if (data.overdue !== undefined && typeof data.overdue !== 'boolean') return badRequest('overdue must be true or false.')
  if (body.nextDueDate !== undefined) {
    data.nextDueDate = body.nextDueDate ? parseDate(body.nextDueDate) : null
    if (body.nextDueDate && !data.nextDueDate) return badRequest('Invalid next due date.')
  }

  const loan = await prisma.loan.update({ where: { loanId: id }, data })
  return NextResponse.json(loan)
}
