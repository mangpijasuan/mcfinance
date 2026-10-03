'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, Table, EmptyState, Badge, Button, Input, PageHeader, StatCard } from '@/components/ui'
import { formatUSD, type Cents } from '@/lib/money'
import type { CollectorCash, PeriodStatus } from '@/modules/accounting/reconciliation'

type Transfer = {
  transferId: string; fromAccount: string; amountCents: Cents; bankDate: string; reference: string | null
  collector: string | null; note: string | null; journalEntry: string; recordedBy: string; approvedBy: string | null
}
type Status =
  | { started: false }
  | {
      started: true; cutover: string; bankCents: Cents; depositDays: number
      clearing: { code: string; name: string; cents: Cents }[]
      collectors: CollectorCash[]; transfers: Transfer[]; periods: PeriodStatus[]
    }
type ItemRow = { kind: 'deposit_in_transit' | 'outstanding_payment'; description: string; amount: string }

const ACCOUNT_LABELS: Record<string, string> = { '1010': 'Stripe', '1020': 'Zelle / transfer', '1030': 'Collector cash' }
const money = (c: Cents) => formatUSD(c)
const monthName = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { res, body: await res.json().catch(() => null) }
}

export default function ReconciliationView({ today, canTransfer, canReconcile, canClose }: { today: string; canTransfer: boolean; canReconcile: boolean; canClose: boolean }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [blockers, setBlockers] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  // Transfer form
  const [fromAccount, setFromAccount] = useState('1030')
  const [amount, setAmount] = useState('')
  const [bankDate, setBankDate] = useState(today)
  const [reference, setReference] = useState('')
  const [collector, setCollector] = useState('')
  // Reconciliation form
  const [period, setPeriod] = useState('')
  const [statementBalance, setStatementBalance] = useState('')
  const [items, setItems] = useState<ItemRow[]>([])
  const [recNote, setRecNote] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/reconciliation', { cache: 'no-store' })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) { setError(body?.error || 'Could not load the reconciliation.'); return }
    setStatus(body)
    if (body.started) {
      const open = (body.periods as PeriodStatus[]).filter((p) => !p.closed).map((p) => p.period).sort()
      setPeriod((current) => current || open[0] || '')
    }
  }, [])
  useEffect(() => { load() }, [load])

  function done(text: string) { setMessage(text); setError(''); setBlockers([]); load() }
  function failed(body: any, fallback: string) { setError(body?.error || fallback); setMessage(''); setBlockers(Array.isArray(body?.blockers) ? body.blockers : []) }

  async function recordTransfer(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    const { res, body } = await post('/api/reconciliation/transfers', { fromAccount, amount, bankDate, reference, collector })
    setBusy(false)
    if (!res.ok) return failed(body, 'Could not record the transfer.')
    if (res.status === 202) done(`Sent for approval (${body.approvalRequest.publicId}). It posts once the Treasurer approves it.`)
    else { done(`Recorded ${body.transferId} (${body.journalEntry}).`); setAmount(''); setReference('') }
  }

  async function reconcile(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    const { res, body } = await post('/api/reconciliation/bank', { period, statementBalance, items, note: recNote })
    setBusy(false)
    if (!res.ok) return failed(body, 'Could not record the reconciliation.')
    done(body.differenceCents === 0
      ? `${monthName(body.period)} reconciles: the bank and the ledger agree at ${money(body.ledgerBalanceCents)}.`
      : `${monthName(body.period)} differs by ${money(body.differenceCents)}. Find what is missing (an unrecorded payment, a transfer, a bank fee), post it, and reconcile again.`)
  }

  async function close(p: string) {
    if (!window.confirm(`Close ${monthName(p)}? Nothing can be posted into it afterwards, and it cannot be reopened.`)) return
    setBusy(true)
    const { res, body } = await post('/api/reconciliation/close', { period: p })
    setBusy(false)
    if (!res.ok) return failed(body, 'Could not close the month.')
    done(`${monthName(p)} is closed.`)
  }

  const header = (
    <PageHeader
      title="Reconciliation"
      sub="Money in transit to the bank, cash held by collectors, the monthly bank reconciliation and the month-end close (F-11)."
    />
  )
  if (status && !status.started) {
    return (
      <div className="p-4 sm:p-8 space-y-6">
        {header}
        <Card className="p-5 text-sm text-gray-600">
          Reconciliation works on the ledger, which starts with the opening balances (<Link className="underline" href="/ledger/opening">M4</Link>).
        </Card>
      </div>
    )
  }
  const s = status?.started ? status : null
  const openPeriods = s ? s.periods.filter((p) => !p.closed).map((p) => p.period).sort() : []
  const nextToClose = s?.periods.find((p) => p.blockers !== null) ?? null
  const collectorNames = s?.collectors.map((c) => c.collector) ?? []

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {header}
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          {blockers.length > 0 && <ul className="mt-1 list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
        </div>
      )}
      {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}

      {s && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Bank (1000)" value={money(s.bankCents)} sub="in the ledger today" color="navy" />
            {s.clearing.map((c) => (
              <StatCard key={c.code} label={`${c.name} (${c.code})`} value={money(c.cents)} sub="not yet in the bank" color={c.cents > 0 ? 'blue' : 'teal'} />
            ))}
          </div>

          <Card>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Cash held by collectors</h2>
              <p className="text-xs text-gray-400">Cash payments each collector recorded since {s.cutover}, less what they deposited; the oldest first. Deposit within {s.depositDays} days.</p>
            </div>
            <Table headers={['Collector', 'Held', 'Oldest not deposited', 'Days']}>
              {s.collectors.length === 0
                ? <EmptyState message="No cash payments recorded since the ledger started." />
                : s.collectors.map((c) => (
                  <tr key={c.collector}>
                    <td className="px-4 py-2">{c.collector}</td>
                    <td className="px-4 py-2 tabular-nums">{money(c.heldCents)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{c.oldestHeld ?? '—'}</td>
                    <td className="px-4 py-2">{c.ageDays === null ? '—' : c.overdue ? <Badge variant="red">{c.ageDays} days</Badge> : `${c.ageDays}`}</td>
                  </tr>
                ))}
            </Table>
          </Card>

          {canTransfer && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Record a transfer to the bank</h2>
              <p className="text-xs text-gray-500 mb-4">
                When money reaches the bank: a Stripe payout, Zelle or transfer receipts, or cash a collector deposited. Use the date and reference on the bank statement.
              </p>
              <form className="flex flex-wrap items-end gap-3" onSubmit={recordTransfer}>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide" htmlFor="from">From</label>
                  <select id="from" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={fromAccount} onChange={(e) => setFromAccount(e.target.value)}>
                    <option value="1030">Cash held by a collector</option>
                    <option value="1020">Zelle / bank transfer</option>
                    <option value="1010">Stripe payout</option>
                  </select>
                </div>
                {fromAccount === '1030' && (
                  <>
                    <Input label="Collector" list="collectors" required value={collector} onChange={(e) => setCollector(e.target.value)} />
                    <datalist id="collectors">{collectorNames.map((n) => <option key={n} value={n} />)}</datalist>
                  </>
                )}
                <Input label="Amount ($)" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Input label="Date on the bank statement" type="date" required value={bankDate} onChange={(e) => setBankDate(e.target.value)} />
                <Input label="Reference" placeholder="deposit slip, payout id" value={reference} onChange={(e) => setReference(e.target.value)} />
                <Button type="submit" disabled={busy}>Record transfer</Button>
              </form>
            </Card>
          )}

          <Card>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Month-end</h2>
              <p className="text-xs text-gray-400">Each month: reconcile the bank statement, then close the month. Closed months never reopen; anything dated in one later is posted in the first open month.</p>
            </div>
            <Table headers={['Month', 'Bank statement', 'Ledger', 'Difference', 'Status']}>
              {s.periods.length === 0
                ? <EmptyState message="No month has ended since the ledger started." />
                : s.periods.map((p) => (
                  <tr key={p.period}>
                    <td className="px-4 py-2 whitespace-nowrap">{monthName(p.period)}</td>
                    <td className="px-4 py-2 tabular-nums">{p.reconciliation ? money(p.reconciliation.statementBalanceCents) : '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{p.reconciliation ? money(p.reconciliation.ledgerBalanceCents) : '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{p.reconciliation ? (p.reconciliation.differenceCents === 0 ? <Badge variant="green">none</Badge> : <Badge variant="red">{money(p.reconciliation.differenceCents)}</Badge>) : '—'}</td>
                    <td className="px-4 py-2">
                      {p.closed
                        ? <Badge variant="gray">Closed {p.closedAt ? new Date(p.closedAt).toLocaleDateString() : ''}</Badge>
                        : p.blockers === null
                          ? <span className="text-xs text-gray-400">close earlier months first</span>
                          : p.blockers.length === 0
                            ? (canClose ? <Button size="sm" onClick={() => close(p.period)} disabled={busy}>Close month</Button> : <Badge variant="green">Ready to close</Badge>)
                            : <ul className="list-disc pl-4 text-xs text-amber-800">{p.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
                    </td>
                  </tr>
                ))}
            </Table>
          </Card>

          {canReconcile && openPeriods.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Reconcile the bank statement</h2>
              <p className="text-xs text-gray-500 mb-4">
                The balance on the bank statement at the month end. Add a deposit the bank had not credited yet, or a payment it had not paid yet, as a reconciling item.
                {nextToClose ? ` Next month to close: ${monthName(nextToClose.period)}.` : ''}
              </p>
              <form className="space-y-3" onSubmit={reconcile}>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide" htmlFor="period">Month</label>
                    <select id="period" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
                      {openPeriods.map((p) => <option key={p} value={p}>{monthName(p)}</option>)}
                    </select>
                  </div>
                  <Input label="Statement balance ($)" inputMode="decimal" required value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} />
                </div>
                {items.map((it, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-3">
                    <select aria-label="Kind" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={it.kind}
                      onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, kind: e.target.value as ItemRow['kind'] } : x)))}>
                      <option value="deposit_in_transit">Deposit in transit (+)</option>
                      <option value="outstanding_payment">Outstanding payment (−)</option>
                    </select>
                    <Input aria-label="Description" placeholder="what it is" value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                    <Input aria-label="Amount" inputMode="decimal" placeholder="amount" value={it.amount} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                    <Button variant="secondary" size="sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</Button>
                  </div>
                ))}
                <div className="flex flex-wrap items-end gap-3">
                  <Button variant="secondary" size="sm" onClick={() => setItems([...items, { kind: 'deposit_in_transit', description: '', amount: '' }])}>Add a reconciling item</Button>
                  <Input placeholder="Note (optional)" aria-label="Note" value={recNote} onChange={(e) => setRecNote(e.target.value)} />
                  <Button type="submit" disabled={busy || !period}>Reconcile</Button>
                </div>
              </form>
            </Card>
          )}

          <Card>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Recent transfers to the bank</h2>
            </div>
            <Table headers={['Date', 'From', 'Amount', 'Reference', 'Entry']}>
              {s.transfers.length === 0
                ? <EmptyState message="No transfers recorded yet." />
                : s.transfers.map((t) => (
                  <tr key={t.transferId}>
                    <td className="px-4 py-2 whitespace-nowrap">{t.bankDate}</td>
                    <td className="px-4 py-2">{ACCOUNT_LABELS[t.fromAccount] ?? t.fromAccount}{t.collector ? ` · ${t.collector}` : ''}</td>
                    <td className="px-4 py-2 tabular-nums">{money(t.amountCents)}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{t.reference ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{t.journalEntry}</td>
                  </tr>
                ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
