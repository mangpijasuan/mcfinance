// Object-level access: a signed-in member reaches only their own records.
import { beforeEach, describe, expect, it } from 'vitest'
import { TEST_IDS, signInAs, signInAsMember } from './helpers/actors'
import { prisma, resetDatabase } from './helpers/db'
import { createBaseFixtures } from './helpers/factories'
import { callRoute } from './helpers/routes'

async function createAgreement(agreementId: string, loanId: string, borrowerId: string) {
  return prisma.loanAgreement.create({
    data: {
      agreementId, loanId, borrowerId, borrowerName: borrowerId,
      loanAmount: 1000, monthlyPayment: 100, termMonths: 10,
      startDate: new Date('2026-02-10'), endDate: new Date('2026-11-15'),
    },
  })
}

describe('member ownership', () => {
  beforeEach(async () => {
    await resetDatabase()
    await createBaseFixtures()
    await createAgreement('AGR-A', 'LN-TEST-A', TEST_IDS.member)
    await createAgreement('AGR-B', 'LN-TEST-B', TEST_IDS.otherMember)
  })

  it('lists only the member’s own agreements', async () => {
    signInAs('member')
    const res = await callRoute('agreements', 'GET')
    expect(res.status).toBe(200)
    expect(res.json.map((a: any) => a.agreementId)).toEqual(['AGR-A'])
  })

  it('refuses another member’s agreement', async () => {
    signInAs('member')
    expect((await callRoute('agreements/[id]', 'GET', { params: { id: 'AGR-B' } })).status).toBe(403)
    const sign = await callRoute('agreements/[id]', 'PATCH', {
      params: { id: 'AGR-B' },
      body: { signatureText: 'Member A', signerType: 'borrower' },
    })
    expect(sign.status).toBe(403)
    const untouched = await prisma.loanAgreement.findUnique({ where: { agreementId: 'AGR-B' } })
    expect(untouched?.borrowerSignature).toBeNull()
  })

  it('lets the co-signer see the agreement', async () => {
    await prisma.loanAgreement.update({ where: { agreementId: 'AGR-B' }, data: { cosignerId: TEST_IDS.member } })
    signInAs('member')
    expect((await callRoute('agreements/[id]', 'GET', { params: { id: 'AGR-B' } })).status).toBe(200)
  })

  it('refuses to start a payment against another member’s loan', async () => {
    signInAs('member')
    const res = await callRoute('portal/payments/checkout', 'POST', {
      body: { type: 'loan_payment', method: 'zelle', amount: 50, loanId: 'LN-TEST-B' },
    })
    expect(res.status).toBe(404)
    expect(await prisma.portalPayment.count()).toBe(0)
  })

  it('shows members only their own payment history', async () => {
    signInAsMember(TEST_IDS.otherMember)
    await callRoute('portal/payments/checkout', 'POST', { body: { type: 'contribution', method: 'zelle', amount: 50 } })
    signInAs('member')
    const res = await callRoute('portal/payments', 'GET')
    expect(res.status).toBe(200)
    expect(res.json.payments).toEqual([])
  })
})
