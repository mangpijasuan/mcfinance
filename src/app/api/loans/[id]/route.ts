import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const loan = await prisma.loan.findUnique({
    where: { loanId: params.id },
    include: {
      payments: { orderBy: { paymentDate: 'desc' } },
      borrower: { select: { id: true, legalName: true, email: true, status: true } },
    },
  })
  if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(loan)
}

const EDITABLE_LOAN_FIELDS = ['notes', 'status', 'overdue'] as const

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json()
  const data: Record<string, unknown> = {}
  for (const field of EDITABLE_LOAN_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field]
  }
  if (body.nextDueDate !== undefined) {
    data.nextDueDate = body.nextDueDate ? new Date(body.nextDueDate) : undefined
  }

  const loan = await prisma.loan.update({ where: { loanId: params.id }, data })
  return NextResponse.json(loan)
}
