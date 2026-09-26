const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
}

function findMemberId(rawName, members, nameToMemberId) {
  const normalized = normalizeName(rawName)
  if (!normalized) return null

  const aliases = {
    'mang lang': 'mang sian lang',
  }

  const alias = aliases[normalized]
  if (alias) {
    const aliasMatch = nameToMemberId.get(alias)
    if (aliasMatch) return aliasMatch
  }

  const exact = nameToMemberId.get(normalized)
  if (exact) return exact

  for (const member of members) {
    const legal = normalizeName(member.legalName)
    const nick = normalizeName(member.nickname)
    if (
      (legal && (legal.includes(normalized) || normalized.includes(legal))) ||
      (nick && (nick.includes(normalized) || normalized.includes(nick)))
    ) {
      return member.id
    }
  }

  return null
}

function diffMonths(start, end) {
  if (!start || !end) return 12
  const s = new Date(start)
  const e = new Date(end)
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  return Math.max(1, months || 12)
}

async function main() {
  const members = await prisma.member.findMany({
    select: { id: true, legalName: true, nickname: true },
  })

  const nameToMemberId = new Map()
  for (const member of members) {
    const legal = normalizeName(member.legalName)
    if (legal) nameToMemberId.set(legal, member.id)
    const nick = normalizeName(member.nickname)
    if (nick) nameToMemberId.set(nick, member.id)
  }

  const historicalActive = await prisma.historicalLoan.findMany({
    where: {
      year: { in: [2024, 2025] },
      status: 'Active',
    },
    orderBy: [{ year: 'asc' }, { loanDate: 'asc' }],
  })

  let synced = 0
  const skipped = []
  const affectedBorrowers = new Set()
  const affectedCosigners = new Set()

  for (const loan of historicalActive) {
    const borrowerId = findMemberId(loan.borrowerName, members, nameToMemberId)
    const cosignerId = loan.cosignerName ? findMemberId(loan.cosignerName, members, nameToMemberId) : null

    if (!borrowerId) {
      skipped.push({ loanId: loan.loanId, reason: `Borrower not matched: ${loan.borrowerName}` })
      continue
    }

    const termMonths = diffMonths(loan.loanDate, loan.endDate)
    const monthlyDue = Math.round((loan.loanAmount / termMonths) * 100) / 100

    await prisma.loan.upsert({
      where: { loanId: loan.loanId },
      update: {
        borrowerId,
        borrowerName: loan.borrowerName,
        cosignerId: cosignerId || null,
        cosignerName: loan.cosignerName || null,
        loanDate: loan.loanDate,
        termMonths,
        loanAmount: loan.loanAmount,
        monthlyDue,
        totalPaid: loan.totalPaid,
        balanceRemaining: loan.balanceRemaining,
        status: loan.balanceRemaining > 0 ? 'Active' : 'Paid Off',
        lifecycle: loan.balanceRemaining > 0 ? 'disbursed' : 'paid_off',
        endDate: loan.endDate,
        nextDueDate: loan.balanceRemaining > 0 ? loan.endDate || null : null,
        overdue: false,
        notes: `Synced from HistoricalLoan (${loan.year})`,
      },
      create: {
        loanId: loan.loanId,
        borrowerId,
        borrowerName: loan.borrowerName,
        cosignerId: cosignerId || null,
        cosignerName: loan.cosignerName || null,
        loanDate: loan.loanDate,
        termMonths,
        loanAmount: loan.loanAmount,
        monthlyDue,
        totalPaid: loan.totalPaid,
        balanceRemaining: loan.balanceRemaining,
        status: loan.balanceRemaining > 0 ? 'Active' : 'Paid Off',
        lifecycle: loan.balanceRemaining > 0 ? 'disbursed' : 'paid_off',
        endDate: loan.endDate,
        nextDueDate: loan.balanceRemaining > 0 ? loan.endDate || null : null,
        overdue: false,
        notes: `Synced from HistoricalLoan (${loan.year})`,
      },
    })

    affectedBorrowers.add(borrowerId)
    if (cosignerId) affectedCosigners.add(cosignerId)
    synced += 1
  }

  for (const borrowerId of affectedBorrowers) {
    const activeAsBorrower = await prisma.loan.count({ where: { borrowerId, status: 'Active' } })
    const balance = await prisma.loan.aggregate({ where: { borrowerId, status: 'Active' }, _sum: { balanceRemaining: true } })
    await prisma.member.update({
      where: { id: borrowerId },
      data: {
        activeAsBorrower: activeAsBorrower > 0 ? 1 : 0,
        currentLoanBalance: balance._sum.balanceRemaining ?? 0,
        eligible: activeAsBorrower > 0 ? 'NO - Active Loan/Cosign' : undefined,
      },
    })
  }

  for (const cosignerId of affectedCosigners) {
    const activeAsCosigner = await prisma.loan.count({ where: { cosignerId, status: 'Active' } })
    await prisma.member.update({
      where: { id: cosignerId },
      data: {
        activeAsCosigner: activeAsCosigner > 0 ? 1 : 0,
        eligible: activeAsCosigner > 0 ? 'NO - Active Loan/Cosign' : undefined,
      },
    })
  }

  console.log(`Synced active historical loans: ${synced}`)
  console.log(`Skipped: ${skipped.length}`)
  if (skipped.length) {
    console.log('Skipped details (first 20):')
    console.log(skipped.slice(0, 20))
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })