import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkLoanPolicy, calcApplicationFee } from '@/lib/loanPolicy'
import { requireAdmin } from '@/lib/apiAuth'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { memberId, amount, termMonths } = await req.json()

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true, status: true, monthsActive: true,
      archiveLifetime: true, contributions2026: true,
      activeAsBorrower: true, activeAsCosigner: true, eligible: true,
    },
  })

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  // Check if they have a recently paid-off loan
  const lastPaidLoan = await prisma.loan.findFirst({
    where: { borrowerId: memberId, status: 'Paid Off' },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  })

  const result = checkLoanPolicy(
    member,
    parseFloat(amount) || 0,
    parseInt(termMonths) || 12,
    lastPaidLoan?.updatedAt
  )

  return NextResponse.json(result)
}
