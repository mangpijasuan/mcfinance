// The card fee (docs/operations/card-fee.md): added to card and Apple Pay
// payments only, shown as its own line at checkout, and never credited to
// the member's contribution or loan.
import Stripe from 'stripe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardFeeCents, cardFeePercent } from '@/lib/cardFee'
import { createBaseFixtures } from './helpers/factories'
import { TEST_IDS, signInAs } from './helpers/actors'
import { prisma, resetDatabase } from './helpers/db'
import { callRoute } from './helpers/routes'

const created: any[] = []
vi.mock('@/lib/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe')>()),
  getStripe: () => ({
    webhooks: new Stripe('sk_test_dummy').webhooks,
    checkout: { sessions: { create: async (args: any) => { created.push(args); return { id: `cs_fee_${created.length}`, url: 'https://checkout.stripe.test/pay' } } } },
  }),
}))

const secret = 'whsec_card_fee_only'
const checkout = (body: Record<string, unknown>) => callRoute('portal/payments/checkout', 'POST', { body: { type: 'contribution', amount: 25, ...body } })
async function deliver(type: string, session: Record<string, unknown>) {
  const payload = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, created: Math.floor(Date.now() / 1000), object: 'event', type, data: { object: session } })
  const signature = new Stripe('sk_test_dummy').webhooks.generateTestHeaderString({ payload, secret })
  return callRoute('webhooks/stripe', 'POST', { rawBody: payload, headers: { 'stripe-signature': signature } })
}

describe('the fee setting', () => {
  it('is off unless set, and never above the card networks’ 3%', () => {
    for (const raw of [undefined, '', '0', '-2', 'abc']) expect(cardFeePercent(raw), String(raw)).toBe(0)
    expect(cardFeePercent('3')).toBe(3)
    expect(cardFeePercent(' 2.5 ')).toBe(2.5)
    expect(cardFeePercent('10')).toBe(3)
  })
  it('is worked out in whole cents', () => {
    expect(cardFeeCents(2500, 3)).toBe(75)
    expect(cardFeeCents(3333, 3)).toBe(100) // 99.99 → 100
    expect(cardFeeCents(1, 3)).toBe(0)
    expect(cardFeeCents(2500, 0)).toBe(0)
    expect(cardFeeCents(0, 3)).toBe(0)
  })
})

describe('checkout with the card fee', () => {
  beforeEach(async () => {
    await resetDatabase()
    await createBaseFixtures()
    created.length = 0
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
    process.env.STRIPE_WEBHOOK_SECRET = secret
    signInAs('member')
  })
  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = ''
    process.env.STRIPE_WEBHOOK_SECRET = ''
    delete process.env.CARD_FEE_PERCENT
  })

  it('adds the fee as its own line for card and Apple Pay, and credits only the chosen amount', async () => {
    process.env.CARD_FEE_PERCENT = '3'
    expect((await callRoute('portal/payments', 'GET')).json.cardFeePercent).toBe(3)
    const res = await checkout({ method: 'stripe' })
    expect(res.status).toBe(201)
    const lines = created[0].line_items
    expect(created[0].payment_method_types).toEqual(['card'])
    expect(lines.map((l: any) => l.price_data.unit_amount)).toEqual([2500, 75])
    expect(lines[1].price_data.product_data.name).toBe('Card fee (3%)')
    const payment = await prisma.portalPayment.findFirstOrThrow()
    expect(payment).toMatchObject({ amount: 25, feeCents: 75, method: 'stripe' })

    // Stripe confirms the total including the fee: the contribution is the $25 only.
    const session = { id: payment.stripeSessionId, currency: 'usd', payment_status: 'paid', payment_intent: 'pi_fee', metadata: { portalPaymentId: payment.id } }
    // A total without the fee, or with a different one, does not match the payment: held for review, nothing credited.
    expect((await deliver('checkout.session.completed', { ...session, amount_total: 2500 })).status).toBe(200)
    expect(await prisma.contribution.count()).toBe(0)
    expect((await deliver('checkout.session.completed', { ...session, amount_total: 2575 })).status).toBe(200)
    const contribution = await prisma.contribution.findFirstOrThrow()
    expect(contribution.amount).toBe(25)
    expect(contribution.comments).toContain('card fee 0.75 collected separately')
    expect(contribution.paymentMethod).toBe('Card (Stripe)')
  })

  it('charges nothing extra when the fee is off', async () => {
    expect((await checkout({ method: 'stripe' })).status).toBe(201)
    expect(created[0].line_items).toHaveLength(1)
    expect(await prisma.portalPayment.findFirstOrThrow()).toMatchObject({ amount: 25, feeCents: 0 })
  })

  it('takes bank payments through Stripe without the fee, and credits them when the bank settles', async () => {
    process.env.CARD_FEE_PERCENT = '3'
    expect((await checkout({ method: 'stripe_bank' })).status).toBe(201)
    expect(created[0].payment_method_types).toEqual(['us_bank_account'])
    expect(created[0].line_items).toHaveLength(1)
    const payment = await prisma.portalPayment.findFirstOrThrow()
    expect(payment).toMatchObject({ method: 'stripe_bank', feeCents: 0 })

    // Not credited while the bank debit is still processing.
    const session = { id: payment.stripeSessionId, currency: 'usd', amount_total: 2500, payment_intent: 'pi_bank', metadata: { portalPaymentId: payment.id } }
    await deliver('checkout.session.completed', { ...session, payment_status: 'unpaid' })
    expect(await prisma.contribution.count()).toBe(0)
    await deliver('checkout.session.async_payment_succeeded', { ...session, payment_status: 'paid' })
    expect(await prisma.contribution.findFirstOrThrow()).toMatchObject({ amount: 25, paymentMethod: 'Bank (Stripe)' })
    expect(await prisma.portalPayment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ status: 'completed' })
  })

  it('marks a failed bank payment failed, so nothing is credited', async () => {
    expect((await checkout({ method: 'stripe_bank' })).status).toBe(201)
    const payment = await prisma.portalPayment.findFirstOrThrow()
    await deliver('checkout.session.async_payment_failed', { id: payment.stripeSessionId, metadata: { portalPaymentId: payment.id } })
    expect(await prisma.portalPayment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ status: 'failed' })
    expect(await prisma.contribution.count()).toBe(0)
  })

  it('says online payments are unavailable until Stripe is set up', async () => {
    process.env.STRIPE_SECRET_KEY = ''
    const res = await checkout({ method: 'stripe_bank' })
    expect(res.status).toBe(409)
    expect(TEST_IDS.member).toBeTruthy()
  })
})
