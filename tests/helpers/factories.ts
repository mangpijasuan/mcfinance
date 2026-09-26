import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { TEST_IDS } from './actors'

// Synthetic fixtures only — never real member data in tests (S-7).

export async function createMember(id: string, overrides: Record<string, unknown> = {}) {
  return prisma.member.create({
    data: {
      id,
      legalName: `Test Member ${id}`,
      joinDate: new Date('2024-01-01'),
      status: 'Active',
      email: `${id.toLowerCase()}@example.test`,
      ...overrides,
    },
  })
}

export async function createAdmin(id: string, role: 'admin' | 'super_admin', password = 'correct horse battery') {
  return prisma.admin.create({
    data: { id, email: `${id}@example.test`, name: id, role, password: await bcrypt.hash(password, 4) },
  })
}

export async function createLoan(loanId: string, borrowerId: string, overrides: Record<string, unknown> = {}) {
  return prisma.loan.create({
    data: {
      loanId,
      borrowerId,
      borrowerName: `Test Member ${borrowerId}`,
      loanDate: new Date('2026-01-15'),
      termMonths: 10,
      loanAmount: 1000,
      monthlyDue: 100,
      balanceRemaining: 1000,
      status: 'Active',
      ...overrides,
    },
  })
}

/** Two members, an admin, a super admin and a loan for member A. */
export async function createBaseFixtures() {
  await createMember(TEST_IDS.member)
  await createMember(TEST_IDS.otherMember)
  await createAdmin(TEST_IDS.admin, 'admin')
  await createAdmin(TEST_IDS.superAdmin, 'super_admin')
  await createLoan('LN-TEST-A', TEST_IDS.member)
  await createLoan('LN-TEST-B', TEST_IDS.otherMember)
}
