'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, Table, EmptyState, Badge, PageHeader, StatCard } from '@/components/ui'
import { formatUSD, type Cents } from '@/lib/money'
import { periodLabel } from '@/modules/contributions/dues'

type Report = {
  currentPeriod: string
  periods: { period: string; billed: number; dueCents: Cents; paidCents: Cents; paidInFull: number; rate: number | null }[]
  arrears: { memberId: string; name: string; status: string; phone: string | null; email: string | null; months: number; oldest: string; amountCents: Cents; bucket: string }[]
  buckets: { bucket: string; members: number; amountCents: Cents }[]
  totalArrearsCents: Cents
}

const BUCKET_VARIANT: Record<string, 'amber' | 'red' | 'gray'> = { '1 month': 'amber', '2–3 months': 'red', '4+ months': 'red' }
const pct = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`)

export default function DuesView() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/dues', { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok || !body) throw new Error(body?.error || 'Could not load dues.')
        setReport(body)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const current = report?.periods.find((p) => p.period === report.currentPeriod)

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <PageHeader
        title="Dues"
        sub="Monthly dues by member. Payments cover the oldest unpaid month first; extra is credit for the next months."
      />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={`Paid for ${periodLabel(report.currentPeriod)}`} value={current ? `${current.paidInFull} of ${current.billed}` : '—'} sub={current ? `${pct(current.rate)} of dues collected` : 'no dues this month yet'} />
            <StatCard label="In arrears" value={String(report.arrears.length)} sub="members with an unpaid past month" color="red" />
            <StatCard label="Arrears" value={formatUSD(report.totalArrearsCents)} sub="unpaid past months" color="red" />
            <StatCard label="4+ months behind" value={String(report.buckets.find((b) => b.bucket === '4+ months')?.members ?? 0)} sub="members" />
          </div>

          <Card>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Members in arrears</h2>
              <p className="text-xs text-gray-400">Unpaid months before {periodLabel(report.currentPeriod)}, most behind first.</p>
            </div>
            <Table headers={['Member', 'Behind', 'Since', 'Owed', 'Contact']}>
              {report.arrears.length === 0
                ? <EmptyState message="Nobody is behind. 🎉" />
                : report.arrears.map((a) => (
                  <tr key={a.memberId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/members/${a.memberId}`} className="font-medium text-gray-900 underline-offset-2 hover:underline">{a.name}</Link>
                      <p className="font-mono text-xs text-gray-500">{a.memberId}{a.status !== 'Active' ? ` · ${a.status}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><Badge variant={BUCKET_VARIANT[a.bucket] ?? 'gray'}>{a.months} {a.months === 1 ? 'month' : 'months'}</Badge></td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{periodLabel(a.oldest)}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold tabular-nums">{formatUSD(a.amountCents)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{[a.phone, a.email].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
            </Table>
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Collection by month</h2>
              <p className="text-xs text-gray-400">How much of each month’s dues has been paid so far, including late payments.</p>
            </div>
            <Table headers={['Month', 'Members billed', 'Paid in full', 'Due', 'Paid', 'Collected']}>
              {report.periods.length === 0
                ? <EmptyState message="No dues billed yet. Run the daily dues job." />
                : report.periods.map((p) => (
                  <tr key={p.period}>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{periodLabel(p.period)}</td>
                    <td className="px-4 py-3 tabular-nums">{p.billed}</td>
                    <td className="px-4 py-3 tabular-nums">{p.paidInFull}</td>
                    <td className="px-4 py-3 tabular-nums">{formatUSD(p.dueCents)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatUSD(p.paidCents)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{pct(p.rate)}</td>
                  </tr>
                ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
