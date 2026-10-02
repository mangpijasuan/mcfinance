'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, Table, EmptyState, Badge, Button, Input, PageHeader, StatCard } from '@/components/ui'
import { formatUSD, type Cents } from '@/lib/money'
import type { TreasuryPosition } from '@/modules/treasury'

const money = (c: Cents | null | undefined) => (c === null || c === undefined ? '—' : formatUSD(c))

const ACCOUNT_NAMES: Record<string, string> = {
  '1000': 'Bank — operating',
  '1010': 'Stripe clearing',
  '1020': 'Zelle / transfer clearing',
  '1030': 'Cash held by collectors',
}

export default function TreasuryView({ canRecord }: { canRecord: boolean }) {
  const [position, setPosition] = useState<TreasuryPosition | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [statementDate, setStatementDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [balance, setBalance] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/treasury', { cache: 'no-store' })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) { setError(body?.error || 'Could not load the treasury position.'); return }
    setPosition(body)
  }, [])
  useEffect(() => { load() }, [load])

  async function record(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setMessage(''); setSaving(true)
    const res = await fetch('/api/treasury/bank-balance', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statementDate, balance, note }),
    })
    const body = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) { setError(body?.error || 'Could not record the balance.'); return }
    if (res.status === 202) {
      setMessage(`Sent for approval (${body.approvalRequest.publicId}). It counts once a second person approves it on the Approvals page.`)
    } else {
      setMessage(`Recorded ${body.balanceId}.`)
      setBalance(''); setNote('')
    }
    load()
  }

  const p = position
  const cash = p?.cash
  const capacity = p?.capacityCents ?? null
  return (
    <div className="p-4 sm:p-8 space-y-6">
      <PageHeader
        title="Treasury"
        sub="The club's cash, the minimum reserve kept for withdrawals, and how much is left to lend (Gate #1 A10)."
      />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {p?.warnings.map((w) => (
        <p key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{w}</p>
      ))}

      {p && cash && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Cash"
              value={money(cash.cents)}
              sub={cash.source === 'ledger' ? 'from the ledger' : cash.source === 'bank_balance' ? `bank balance at ${cash.balance.statementDate}, carried forward` : 'no bank balance recorded'}
              color="teal"
            />
            <StatCard
              label="Minimum reserve"
              value={money(p.reserve.cents)}
              sub={p.reserve.basis === 'capital' ? `${p.policy.reserveCapitalPercent}% of member capital` : `${p.policy.reserveWithdrawalMonths} months of withdrawals`}
              color="navy"
            />
            <StatCard label="Approved, not paid out" value={money(p.committed.cents)} sub={`${p.committed.loans.length} loan(s)`} color="blue" />
            <StatCard
              label="Lending capacity"
              value={capacity === null ? 'Unknown' : money(capacity)}
              sub={capacity === null ? 'record a bank balance' : capacity < 0 ? 'short: no new loans' : 'available for new loans'}
              color={capacity === null || capacity < 0 ? 'red' : 'navy'}
            />
          </div>

          <Card className="p-5 text-sm text-gray-700 space-y-2">
            <p>
              <strong>Lending capacity</strong> = cash − minimum reserve − loans approved but not yet paid out.
              {' '}A loan is approved only if its payout (the amount less the application fee) fits; otherwise the approval is refused.
            </p>
            <p className="text-gray-500">
              The reserve is the greater of {p.policy.reserveCapitalPercent}% of member capital ({money(p.reserve.byCapitalCents)} of {money(p.memberCapitalCents)})
              {' '}and {p.policy.reserveWithdrawalMonths} months of withdrawals at the average of the last {p.policy.withdrawalLookbackMonths} months
              {' '}({money(p.reserve.byWithdrawalsCents)}, from {money(p.recentWithdrawals.cents)} withdrawn since {p.recentWithdrawals.from}). It is never lent out.
            </p>
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Where the cash figure comes from</h2>
            </div>
            {cash.source === 'ledger' && (
              <Table headers={['Account', 'Balance']}>
                {[
                  ...cash.accounts.map((a) => (
                    <tr key={a.code}>
                      <td className="px-4 py-2">{a.code} {ACCOUNT_NAMES[a.code] ?? ''}</td>
                      <td className="px-4 py-2 tabular-nums">{money(a.cents)}</td>
                    </tr>
                  )),
                  <tr key="unposted">
                    <td className="px-4 py-2">Withdrawals recorded, not yet in the ledger</td>
                    <td className="px-4 py-2 tabular-nums">− {money(cash.unpostedWithdrawalsCents)}</td>
                  </tr>,
                ]}
              </Table>
            )}
            {cash.source === 'bank_balance' && (
              <Table headers={['', 'Count', 'Amount']}>
                <tr>
                  <td className="px-4 py-2">
                    Bank balance at the end of {cash.balance.statementDate}{' '}
                    <span className="text-xs text-gray-400">({cash.balance.balanceId}, {cash.balance.ageDays} days ago{cash.balance.note ? ` · ${cash.balance.note}` : ''})</span>
                  </td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2 tabular-nums">{money(cash.balance.balanceCents)}</td>
                </tr>
                <tr><td className="px-4 py-2">+ Contributions recorded since</td><td className="px-4 py-2">{cash.since.contributions.count}</td><td className="px-4 py-2 tabular-nums">{money(cash.since.contributions.cents)}</td></tr>
                <tr><td className="px-4 py-2">+ Loan repayments recorded since</td><td className="px-4 py-2">{cash.since.loanRepayments.count}</td><td className="px-4 py-2 tabular-nums">{money(cash.since.loanRepayments.cents)}</td></tr>
                <tr><td className="px-4 py-2">− Loans paid out since</td><td className="px-4 py-2">{cash.since.loanPayouts.count}</td><td className="px-4 py-2 tabular-nums">{money(cash.since.loanPayouts.cents)}</td></tr>
                <tr><td className="px-4 py-2">− Withdrawals paid since</td><td className="px-4 py-2">{cash.since.withdrawals.count}</td><td className="px-4 py-2 tabular-nums">{money(cash.since.withdrawals.cents)}</td></tr>
                <tr className="font-semibold"><td className="px-4 py-2">= Cash</td><td className="px-4 py-2" /><td className="px-4 py-2 tabular-nums">{money(cash.cents)}</td></tr>
              </Table>
            )}
            {cash.source === 'unknown' && (
              <p className="px-5 py-6 text-sm text-gray-500">
                No bank balance has been recorded yet. Until the ledger holds the club&apos;s cash (opening balances, M4), the cash figure is the
                latest balance from the bank statement, carried forward with the money recorded here since.
              </p>
            )}
          </Card>

          {canRecord && cash.source !== 'ledger' && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Record the bank balance</h2>
              <p className="text-xs text-gray-500 mb-4">
                The total in the club&apos;s bank account(s) at the end of a day, from the statement or online banking. Recorded balances are never changed;
                {' '}to correct one, record the right balance again.
              </p>
              <form className="flex flex-wrap items-end gap-3" onSubmit={record}>
                <Input label="End of day" type="date" required value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
                <Input label="Balance ($)" inputMode="decimal" required placeholder="e.g. 48,250.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
                <Input label="Note (optional)" placeholder="statement, account" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button type="submit" disabled={saving}>{saving ? 'Recording…' : 'Record balance'}</Button>
              </form>
            </Card>
          )}
          {cash.source === 'ledger' && (
            <p className="text-xs text-gray-500">The ledger holds the club&apos;s cash since the opening balances were posted, so recorded bank balances no longer count here.</p>
          )}

          <Card>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Approved, not yet paid out</h2>
              <p className="text-xs text-gray-400">Their payouts are already promised, so they come off the lending capacity.</p>
            </div>
            <Table headers={['Loan', 'Borrower', 'Stage', 'Payout']}>
              {p.committed.loans.length === 0
                ? <EmptyState message="No approved loans are waiting to be paid out." />
                : p.committed.loans.map((l) => (
                  <tr key={l.loanId}>
                    <td className="px-4 py-2 font-mono text-xs"><Link className="underline" href={`/loans/${l.loanId}`}>{l.loanId}</Link></td>
                    <td className="px-4 py-2">{l.borrowerName}</td>
                    <td className="px-4 py-2"><Badge variant="blue">{l.lifecycle === 'approved' ? 'Approved' : 'Agreement signed'}</Badge></td>
                    <td className="px-4 py-2 tabular-nums">{money(l.payoutCents)}</td>
                  </tr>
                ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
