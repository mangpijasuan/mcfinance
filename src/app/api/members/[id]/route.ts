import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/apiAuth'
import { sanitizeMember } from '@/lib/serializers'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const member = await prisma.member.findUnique({
    where: { id },
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
    where: { linkedMemberId: id },
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

const EDITABLE_MEMBER_FIELDS = [
  'legalName', 'nickname', 'status', 'phoneNo', 'email',
  'beneficiary', 'notes', 'riskFlag',
] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  for (const field of EDITABLE_MEMBER_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field]
  }
  if (body.joinDate !== undefined) data.joinDate = body.joinDate ? new Date(body.joinDate) : undefined
  if (body.lastContributionDate !== undefined) {
    data.lastContributionDate = body.lastContributionDate ? new Date(body.lastContributionDate) : undefined
  }

  const member = await prisma.member.update({ where: { id }, data })
  return NextResponse.json(sanitizeMember(member))
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  await prisma.member.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
