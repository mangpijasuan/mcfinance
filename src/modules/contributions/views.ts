// Read-only views of dues for the API: one member's position (staff and
// portal), and the club-wide collection and arrears report. Amounts are
// integer cents.
import type { Prisma } from '@prisma/client'
import { type Cents, fromBigInt, sum } from '@/lib/money'
import { todayIso } from '@/lib/dates'
import { type Period, addPeriods, agingBucket, duesStatus, periodOf } from './dues'
import { memberDues } from './index'

type Db = Pick<Prisma.TransactionClient, 'duesObligation' | 'contribution' | 'duesPlan' | 'member'>

export type ReceiptView = {
  transactionId: string
  receiptNumber: string | null
  memberId: string
  memberName: string
  paymentDate: Date
  recordedAt: Date
  amountCents: number
  category: string
  paymentMethod: string | null
  receivedBy: string | null
  covers: string | null
  reversed: { at: Date; reason: string | null } | null
}

export function receiptView(c: Prisma.ContributionGetPayload<object>): ReceiptView {
  return {
    transactionId: c.transactionId,
    receiptNumber: c.receiptNumber,
    memberId: c.memberId,
    memberName: c.memberName,
    paymentDate: c.paymentDate,
    recordedAt: c.entryTimestamp,
    amountCents: fromBigInt(c.amountCents),
    category: c.category,
    paymentMethod: c.paymentMethod,
    receivedBy: c.receivedBy,
    covers: c.receiptCovers,
    reversed: c.reversedAt ? { at: c.reversedAt, reason: c.reversalReason } : null,
  }
}

/** One member: plan, month-by-month status, what is owed or prepaid, recent receipts. */
export async function memberDuesView(db: Db, memberId: string, opts: { months?: number } = {}) {
  const current = periodOf(todayIso())
  const { status, plans, coveredThrough } = await memberDues(db, memberId, current)
  const receipts = await db.contribution.findMany({ where: { memberId }, orderBy: [{ entryTimestamp: 'desc' }, { id: 'desc' }], take: 24 })
  const member = await db.member.findUnique({ where: { id: memberId }, select: { status: true, duesThrough: true } })
  const currentPlan = [...plans].filter((p) => p.startPeriod <= current).pop() ?? plans[0] ?? null
  return {
    currentPeriod: current,
    memberStatus: member?.status ?? null,
    plans: plans.map((p) => ({ startPeriod: p.startPeriod, amountCents: p.amount })),
    monthlyCents: currentPlan?.amount ?? null,
    nextChangeFrom: member?.duesThrough ? addPeriods(member.duesThrough, 1) : null,
    obligations: status.obligations.slice(-(opts.months ?? 12)).reverse().map((o) => ({
      period: o.period, amountCents: o.amount, paidCents: o.paid, remainingCents: o.remaining, status: o.status,
    })),
    paidThrough: status.paidThrough,
    coveredThrough,
    currentPaid: status.currentPaid,
    arrearsCents: status.arrears,
    overdueMonths: status.overduePeriods.length,
    creditCents: status.credit,
    receipts: receipts.map(receiptView),
  }
}

/**
 * Club-wide: for each of the last months, what was due and how much of it
 * is paid; and every member with unpaid past months, oldest first.
 */
export async function clubDuesReport(db: Db, months = 12) {
  const current = periodOf(todayIso())
  const since = addPeriods(current, -(months - 1))
  const [members, obligations, payments] = await Promise.all([
    db.member.findMany({ select: { id: true, legalName: true, status: true, phoneNo: true, email: true } }),
    db.duesObligation.findMany({ orderBy: { period: 'asc' } }),
    db.contribution.findMany({
      where: { category: 'dues', reversedAt: null, amountCents: { gt: 0 } },
      orderBy: [{ entryTimestamp: 'asc' }, { id: 'asc' }],
      select: { transactionId: true, memberId: true, amountCents: true },
    }),
  ])
  const byMember = new Map<string, { obligations: { period: Period; amount: Cents }[]; payments: { id: string; amount: Cents }[] }>()
  const entry = (id: string) => {
    if (!byMember.has(id)) byMember.set(id, { obligations: [], payments: [] })
    return byMember.get(id)!
  }
  for (const o of obligations) entry(o.memberId).obligations.push({ period: o.period, amount: fromBigInt(o.amountCents) })
  for (const p of payments) entry(p.memberId).payments.push({ id: p.transactionId, amount: fromBigInt(p.amountCents) })

  const perPeriod = new Map<Period, { billed: number; dueCents: number; paidCents: number; paidInFull: number }>()
  const arrears: {
    memberId: string; name: string; status: string; phone: string | null; email: string | null
    months: number; oldest: Period; amountCents: Cents; bucket: string
  }[] = []
  for (const m of members) {
    const data = byMember.get(m.id)
    if (!data || data.obligations.length === 0) continue
    const status = duesStatus({ obligations: data.obligations, payments: data.payments, currentPeriod: current })
    for (const o of status.obligations) {
      if (o.period < since || o.period > current) continue
      const row = perPeriod.get(o.period) ?? { billed: 0, dueCents: 0, paidCents: 0, paidInFull: 0 }
      row.billed++
      row.dueCents += o.amount
      row.paidCents += o.paid
      if (o.remaining === 0) row.paidInFull++
      perPeriod.set(o.period, row)
    }
    if (status.overduePeriods.length > 0) {
      arrears.push({
        memberId: m.id, name: m.legalName, status: m.status, phone: m.phoneNo, email: m.email,
        months: status.overduePeriods.length, oldest: status.overduePeriods[0], amountCents: status.arrears,
        bucket: agingBucket(status.overduePeriods.length)!,
      })
    }
  }
  arrears.sort((a, b) => b.months - a.months || b.amountCents - a.amountCents || a.name.localeCompare(b.name))
  const periods = Array.from(perPeriod.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([period, r]) => ({ period, ...r, rate: r.dueCents === 0 ? null : r.paidCents / r.dueCents }))
  const buckets = ['1 month', '2–3 months', '4+ months'].map((bucket) => {
    const rows = arrears.filter((a) => a.bucket === bucket)
    return { bucket, members: rows.length, amountCents: sum(rows.map((r) => r.amountCents)) }
  })
  return { currentPeriod: current, periods, arrears, buckets, totalArrearsCents: sum(arrears.map((a) => a.amountCents)) }
}
