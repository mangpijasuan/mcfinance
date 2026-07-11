import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'
import { sanitizeMember } from '@/lib/serializers'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const member = await prisma.member.findUnique({
    where: { id: params.id },
    include: {
      contributions: { orderBy: { paymentDate: 'desc' }, take: 24 },
      loansAsBorrower: {
        where: { agreement: { is: { status: { not: 'cancelled' } } } },
        include: { payments: { orderBy: { paymentDate: 'desc' } } },
      },
      yearlyTotals: { orderBy: { year: 'asc' } },
    },
  })
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ')
  const names = new Set<string>([member.legalName, member.nickname || ''].filter(Boolean).map((n) => normalize(String(n))))

  const historical = await prisma.historicalLoan.findMany({
    orderBy: [{ year: 'desc' }, { loanDate: 'desc' }],
  })
  const linkedAdmin = await prisma.admin.findFirst({
    where: { linkedMemberId: params.id },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })

  const historicalLoansAsBorrower = historical.filter((loan) => names.has(normalize(loan.borrowerName)))
  const historicalLoansAsCosigner = historical.filter((loan) => loan.cosignerName && names.has(normalize(loan.cosignerName)))

  return NextResponse.json({
    ...sanitizeMember(member),
    linkedAdmin: linkedAdmin
      ? {
          id: linkedAdmin.id,
          email: linkedAdmin.email,
          name: linkedAdmin.name,
          role: linkedAdmin.role === 'super_admin' ? 'super_admin' : 'admin',
          roleLabel: linkedAdmin.role === 'super_admin' ? 'Super Admin' : 'Admin',
          createdAt: linkedAdmin.createdAt,
        }
      : null,
    historicalLoansAsBorrower,
    historicalLoansAsCosigner,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json()
  const member = await prisma.member.update({
    where: { id: params.id },
    data: {
      ...body,
      joinDate: body.joinDate ? new Date(body.joinDate) : undefined,
      lastContributionDate: body.lastContributionDate ? new Date(body.lastContributionDate) : undefined,
    },
  })
  return NextResponse.json(sanitizeMember(member))
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  await prisma.member.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
