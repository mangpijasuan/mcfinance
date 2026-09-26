'use client'
import { useCallback, useEffect, useState } from 'react'
import { Card, Badge, Button, Input, Modal } from '@/components/ui'
import { formatUSD, type Cents } from '@/lib/money'
import { periodLabel } from '@/modules/contributions/dues'

export type DuesData = {
  currentPeriod: string
  memberStatus: string | null
  plans: { startPeriod: string; amountCents: Cents }[]
  monthlyCents: Cents | null
  nextChangeFrom: string | null
  obligations: { period: string; amountCents: Cents; paidCents: Cents; remainingCents: Cents; status: string }[]
  paidThrough: string | null
  coveredThrough: string | null
  currentPaid: boolean | null
  arrearsCents: Cents
  overdueMonths: number
  creditCents: Cents
}

const STATUS: Record<string, { variant: 'green' | 'amber' | 'red' | 'gray'; label: string }> = {
  paid: { variant: 'green', label: 'Paid' },
  partly_paid: { variant: 'amber', label: 'Part paid' },
  overdue: { variant: 'red', label: 'Unpaid' },
  due: { variant: 'gray', label: 'Due' },
  upcoming: { variant: 'gray', label: 'Upcoming' },
}

/** The dues summary line: covered through, owed, or credit. */
export function DuesSummary({ d }: { d: DuesData }) {
  if (d.overdueMonths > 0) {
    return <p className="text-sm text-red-700"><strong>{formatUSD(d.arrearsCents)}</strong> unpaid for {d.overdueMonths} past {d.overdueMonths === 1 ? 'month' : 'months'}.</p>
  }
  if (d.coveredThrough && d.coveredThrough >= d.currentPeriod) {
    return <p className="text-sm text-emerald-700">Paid through <strong>{periodLabel(d.coveredThrough)}</strong>{d.creditCents > 0 ? ` · ${formatUSD(d.creditCents)} credit` : ''}.</p>
  }
  if (d.obligations.length === 0) return <p className="text-sm text-gray-500">No dues billed yet.</p>
  return <p className="text-sm text-gray-700">{periodLabel(d.currentPeriod)} is due.</p>
}

export function DuesMonths({ d }: { d: DuesData }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {d.obligations.map((o) => {
        const s = STATUS[o.status] ?? STATUS.due
        return (
          <div key={o.period} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
            <p className="text-xs font-medium text-gray-500">{periodLabel(o.period)}</p>
            <p className="text-sm font-semibold tabular-nums">{formatUSD(o.amountCents)}</p>
            <Badge variant={s.variant}>{s.label}</Badge>
          </div>
        )
      })}
    </div>
  )
}

/** Staff view of one member's dues, with plan changes for the Treasurer. */
export default function DuesPanel({ memberId, canChangePlan }: { memberId: string; canChangePlan: boolean }) {
  const [d, setD] = useState<DuesData | null>(null)
  const [error, setError] = useState('')
  const [change, setChange] = useState<{ amount: string; startPeriod: string; note: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/members/${memberId}/dues`, { cache: 'no-store' })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) { setError(body?.error || 'Could not load dues.'); return }
    setD(body)
  }, [memberId])
  useEffect(() => { load() }, [load])

  async function savePlan(e: React.FormEvent) {
    e.preventDefault()
    if (!change) return
    const res = await fetch(`/api/members/${memberId}/dues`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(change),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) { setError(body?.error || 'Could not change the plan.'); return }
    setChange(null); setError(''); setD(body)
  }

  if (!d) return error ? <p role="alert" className="mb-6 text-sm text-red-700">{error}</p> : null

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-700">Dues</h2>
          <p className="text-xs text-gray-400">
            {d.monthlyCents !== null ? `${formatUSD(d.monthlyCents)} a month` : 'No plan'}
            {d.plans.length > 1 ? ` · ${d.plans.length} plan changes` : ''}. Payments cover the oldest unpaid month first.
          </p>
        </div>
        {canChangePlan && d.nextChangeFrom && (
          <Button size="sm" variant="secondary" onClick={() => setChange({ amount: d.monthlyCents !== null ? (d.monthlyCents / 100).toFixed(2) : '20.00', startPeriod: d.nextChangeFrom!, note: '' })}>
            Change amount
          </Button>
        )}
      </div>
      <div className="space-y-4 p-5">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <DuesSummary d={d} />
        <DuesMonths d={d} />
      </div>
      <Modal open={change !== null} onClose={() => setChange(null)} title="Change monthly dues">
        {change && (
          <form onSubmit={savePlan} className="space-y-4">
            <p className="text-sm text-gray-600">
              Applies from a month that has not been billed yet ({periodLabel(d.nextChangeFrom!)} or later). $0 means no dues from then on.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Amount ($)" type="number" min="0" step="0.01" required value={change.amount} onChange={(e) => setChange({ ...change, amount: e.target.value })} />
              <Input label="From month" type="month" required min={d.nextChangeFrom!} value={change.startPeriod} onChange={(e) => setChange({ ...change, startPeriod: e.target.value })} />
            </div>
            <Input label="Note" value={change.note} placeholder="e.g. agreed hardship rate" onChange={(e) => setChange({ ...change, note: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setChange(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  )
}
