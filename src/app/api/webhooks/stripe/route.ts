import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { recordContribution, recordLoanPayment } from '@/lib/paymentActions'

export const runtime = 'nodejs'

async function completeCheckout(session: Stripe.Checkout.Session) {
  const portalPaymentId = session.metadata?.portalPaymentId || session.client_reference_id
  if (!portalPaymentId) return
  // Card payments are "paid" at completion; anything else waits for
  // checkout.session.async_payment_succeeded.
  if (session.payment_status !== 'paid') return

  const payment = await prisma.portalPayment.findUnique({ where: { id: portalPaymentId } })
  if (!payment || payment.method !== 'stripe') return

  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  const details = {
    paymentDate: new Date(),
    paymentMethod: 'Card (Stripe)',
    comments: `Stripe checkout ${session.id}`,
    source: 'Stripe',
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Stripe retries and can deliver the same event concurrently. Only
      // one delivery can move the payment to "completed"; the rest match
      // nothing here (after waiting on the row lock) and record nothing.
      const claimed = await tx.portalPayment.updateMany({
        where: { id: payment.id, status: { not: 'completed' } },
        data: { status: 'completed', stripePaymentIntentId: paymentIntentId, reviewedAt: new Date() },
      })
      if (claimed.count === 0) return

      if (payment.type === 'contribution') {
        const record = await recordContribution(tx, { memberId: payment.memberId, amount: payment.amount, ...details })
        await tx.portalPayment.update({ where: { id: payment.id }, data: { contributionId: record.id } })
      } else {
        if (!payment.loanId) throw new Error('Missing loanId on loan_payment PortalPayment')
        const record = await recordLoanPayment(tx, { loanId: payment.loanId, amount: payment.amount, ...details })
        await tx.portalPayment.update({ where: { id: payment.id }, data: { loanPaymentId: record.id } })
      }
    })
  } catch (err: any) {
    await prisma.portalPayment.updateMany({
      where: { id: payment.id, status: { not: 'completed' } },
      data: { status: 'failed', rejectionReason: err?.message?.slice(0, 500) || 'Failed to record payment' },
    })
  }
}

async function expireCheckout(session: Stripe.Checkout.Session) {
  const portalPaymentId = session.metadata?.portalPaymentId || session.client_reference_id
  if (!portalPaymentId) return
  await prisma.portalPayment.updateMany({
    where: { id: portalPaymentId, method: 'stripe', status: 'pending' },
    data: { status: 'failed' },
  })
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = req.headers.get('stripe-signature')
  if (!secret || !signature) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 })
  }

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err: any) {
    return NextResponse.json({ error: `Signature verification failed: ${err?.message}` }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await completeCheckout(event.data.object as Stripe.Checkout.Session)
      break
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      await expireCheckout(event.data.object as Stripe.Checkout.Session)
      break
  }

  return NextResponse.json({ received: true })
}
