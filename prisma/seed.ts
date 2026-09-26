import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import seedData from './seed-data.json'
import historicalLoans from './historical-loans.json'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Default admin account
  const adminPassword = process.env.ADMIN_SEED_PASSWORD
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error('Set ADMIN_SEED_PASSWORD (at least 12 characters) before seeding.')
  }
  const hashed = await bcrypt.hash(adminPassword, 10)
  await prisma.admin.upsert({
    where: { email: 'admin@millionairesclub.com' },
    update: { role: 'super_admin' },
    create: { email: 'admin@millionairesclub.com', name: 'Club Admin', password: hashed, role: 'super_admin' },
  })
  console.log('✓ Admin account created')

  // Members
  for (const m of seedData.members) {
    await prisma.member.upsert({
      where: { id: m.id },
      update: {},
      create: {
        ...m,
        joinDate: new Date(m.joinDate!),
        lastContributionDate: m.lastContributionDate ? new Date(m.lastContributionDate) : null,
      } as any,
    })
  }
  console.log(`✓ ${seedData.members.length} members`)

  // Yearly totals
  for (const y of seedData.yearlyTotals) {
    await prisma.yearlyTotal.upsert({
      where: { memberId_year: { memberId: y.memberId, year: y.year } },
      update: {},
      create: y,
    })
  }
  console.log(`✓ ${seedData.yearlyTotals.length} yearly totals`)

  // Contributions
  for (const c of seedData.contributions) {
    await prisma.contribution.upsert({
      where: { transactionId: c.transactionId },
      update: {},
      create: { ...c, paymentDate: new Date(c.paymentDate!) } as any,
    })
  }
  console.log(`✓ ${seedData.contributions.length} contributions`)

  // Loans
  for (const l of seedData.loans) {
    await prisma.loan.upsert({
      where: { loanId: l.loanId },
      update: {},
      create: {
        ...l,
        loanDate: new Date(l.loanDate!),
        endDate: l.endDate ? new Date(l.endDate) : null,
        nextDueDate: l.nextDueDate ? new Date(l.nextDueDate) : null,
      } as any,
    })
  }
  console.log(`✓ ${seedData.loans.length} loans`)

  // Loan payments
  for (const p of seedData.loanPayments) {
    await prisma.loanPayment.upsert({
      where: { paymentId: p.paymentId },
      update: {},
      create: { ...p, paymentDate: new Date(p.paymentDate!) } as any,
    })
  }
  console.log(`✓ ${seedData.loanPayments.length} loan payments`)

  // Historical loans
  for (const loan of historicalLoans) {
    await prisma.historicalLoan.upsert({
      where: { loanId: loan.loanId },
      update: {},
      create: {
        ...loan,
        loanDate: new Date(loan.loanDate),
        endDate: loan.endDate ? new Date(loan.endDate) : null,
      } as any,
    })
  }
  console.log(`✓ ${historicalLoans.length} historical loans`)

  console.log('\n✅ Done!')
  console.log('📧 Login: admin@millionairesclub.com')
  console.log('🔑 Password: the value of ADMIN_SEED_PASSWORD')
  console.log('⚠️  Change this password after first login!')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
