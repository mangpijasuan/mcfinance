import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'

export async function GET() {
  const auth = await requirePermission('dashboard.view')
  if (auth.error) return auth.error

  const currentYear = new Date().getFullYear()
  const yearStart = new Date(Date.UTC(currentYear, 0, 1))
  const yearEnd = new Date(Date.UTC(currentYear + 1, 0, 1))

  const [
    totalMembers, activeMembers, inactiveMembers,
    activeLoans, overdueLoans,
    outstandingBal, contribSum, memberOverallContrib,
    eligibleMembers,
    withdrawalAgg, withdrawalCount,
    recentContribs, yearContribs, loanList,
  ] = await Promise.all([
    prisma.member.count(),
    prisma.member.count({ where: { status: 'Active' } }),
    prisma.member.count({ where: { status: 'Inactive' } }),
    prisma.loan.count({ where: { status: 'Active' } }),
    prisma.loan.count({ where: { overdue: true } }),
    prisma.loan.aggregate({ where: { status: 'Active' }, _sum: { balanceRemaining: true } }),
    prisma.contribution.aggregate({ where: { reversedAt: null }, _sum: { amount: true } }),
    prisma.member.aggregate({ _sum: { overallContributions: true } }),
    prisma.member.count({ where: { eligible: 'YES' } }),
    prisma.withdrawal.aggregate({ _sum: { amount: true } }),
    prisma.withdrawal.count(),
    prisma.contribution.findMany({
      where: { reversedAt: null }, orderBy: { paymentDate: 'desc' }, take: 6,
      select: { transactionId: true, memberName: true, amount: true, paymentDate: true, monthYear: true, paymentMethod: true },
    }),
    prisma.contribution.findMany({
      where: { paymentDate: { gte: yearStart, lt: yearEnd }, reversedAt: null },
      select: { paymentDate: true, amount: true },
    }),
    prisma.loan.findMany({
      where: { status: 'Active' },
      select: { loanId: true, borrowerName: true, loanAmount: true, balanceRemaining: true, monthlyDue: true, nextDueDate: true, overdue: true },
      orderBy: { overdue: 'desc' },
    }),
  ])

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const byMonth = Array.from({ length: 12 }, () => 0)
  for (const c of yearContribs) {
    const m = new Date(c.paymentDate).getUTCMonth()
    byMonth[m] += c.amount ?? 0
  }

  const monthlyBreakdown = monthLabels.map((label, idx) => ({
    monthYear: `${label}-${currentYear}`,
    _sum: { amount: byMonth[idx] },
  }))

  return NextResponse.json({
    stats: {
      totalMembers, activeMembers, inactiveMembers,
      activeLoans, overdueLoans,
      outstandingBalance: outstandingBal._sum.balanceRemaining ?? 0,
      totalContributions: memberOverallContrib._sum.overallContributions ?? 0,
      contributionsLogged: contribSum._sum.amount ?? 0,
      eligibleMembers,
      totalWithdrawn: withdrawalAgg._sum.amount ?? 0,
      withdrawalCount,
    },
    recentContribs,
    monthlyBreakdown,
    activeLoansDetail: loanList,
  })
}
