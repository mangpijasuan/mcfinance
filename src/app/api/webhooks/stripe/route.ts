import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { recordContribution, recordLoanPayment } from '@/lib/paymentActions'

export const runtime = 'nodejs'

async function completeCheckout(session: Stripe.Checkout.Session) {
  const portalPaymentId = session.metadata?.portalPaymentId || session.client_reference_id
  if (!portalPaymentId) return

  const payment = await prisma.portalPayment.findUnique({ where: { id: portalPaymentId } })
  if (!payment) return
  if (payment.status === 'completed') return // already processed — idempotent on webhook retries

  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id

  try {
    await prisma.$transaction(async (tx) => {
      if (payment.type === 'contribution') {
        const record = await recordContribution(tx, {
          memberId: payment.memberId,
          amount: payment.amount,
          paymentDate: new Date(),
          paymentMethod: 'Card (Stripe)',
          comments: `Stripe checkout ${session.id}`,
          source: 'Stripe',
        })
        await tx.portalPayment.update({
          where: { id: payment.id },
          data: { status: 'completed', stripePaymentIntentId: paymentIntentId, contributionId: record.id, reviewedAt: new Date() },
        })
      } else {
        if (!payment.loanId) throw new Error('Missing loanId on loan_payment PortalPayment')
        const record = await recordLoanPayment(tx, {
          loanId: payment.loanId,
          amount: payment.amount,
          paymentDate: new Date(),
          paymentMethod: 'Card (Stripe)',
          comments: `Stripe checkout ${session.id}`,
          source: 'Stripe',
        })
        await tx.portalPayment.update({
          where: { id: payment.id },
          data: { status: 'completed', stripePaymentIntentId: paymentIntentId, loanPaymentId: record.id, reviewedAt: new Date() },
        })
      }
    })
  } catch (err: any) {
    await prisma.portalPayment.update({
      where: { id: payment.id },
      data: { status: 'failed', rejectionReason: err?.message?.slice(0, 500) || 'Failed to record payment' },
    })
  }
}

async function expireCheckout(session: Stripe.Checkout.Session) {
  const portalPaymentId = session.metadata?.portalPaymentId || session.client_reference_id
  if (!portalPaymentId) return
  const payment = await prisma.portalPayment.findUnique({ where: { id: portalPaymentId } })
  if (!payment || payment.status !== 'pending') return
  await prisma.portalPayment.update({ where: { id: payment.id }, data: { status: 'failed' } })
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
      await completeCheckout(event.data.object as Stripe.Checkout.Session)
      break
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      await expireCheckout(event.data.object as Stripe.Checkout.Session)
      break
  }

  return NextResponse.json({ received: true })
}
