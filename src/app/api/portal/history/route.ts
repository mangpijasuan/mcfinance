import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMember } from '@/modules/auth'

export async function GET() {
  const auth = await requireMember()
  if (auth.error) return auth.error
  const memberId = auth.principal.memberId

  const [member, yearlyTotals, contributions2026, historical] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: { legalName: true, nickname: true },
    }),
    prisma.yearlyTotal.findMany({
      where: { memberId },
      orderBy: { year: 'asc' },
    }),
    prisma.contribution.findMany({
      where: { memberId },
      orderBy: { paymentDate: 'desc' },
    }),
    prisma.historicalLoan.findMany({
      where: { year: { gte: 2024 } },
      orderBy: [{ year: 'desc' }, { loanDate: 'desc' }],
    }),
  ])

  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ')
  const names = new Set<string>([member.legalName, member.nickname || ''].filter(Boolean).map((n) => normalize(String(n))))

  const historicalLoansAsBorrower = historical.filter((loan) => names.has(normalize(loan.borrowerName)))
  const historicalLoansAsCosigner = historical.filter((loan) => loan.cosignerName && names.has(normalize(loan.cosignerName)))

  return NextResponse.json({
    yearlyTotals,
    contributions2026,
    historicalLoansAsBorrower,
    historicalLoansAsCosigner,
  })
}
