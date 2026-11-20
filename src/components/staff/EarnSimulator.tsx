'use client'

import { useState } from 'react'
import { Badge, Button, Card, Input } from '@/components/ui'
import { advanceSimulation, calculateEarnReward, createSimulation, EARN_TERMS, simulateClaim, simulateDeposit, simulateLock, simulateTransfer, type EarnSimulation, type Source, type Wallet } from '@/modules/rewards/earnSimulator'

const fmt = (value: number) => value.toLocaleString('en-US')
const selectClass = 'mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-navy'

export default function EarnSimulator() {
  const [state, setState] = useState(createSimulation)
  const [wallet, setWallet] = useState<Wallet>('A')
  const [source, setSource] = useState<Source>('dex')
  const [receipt, setReceipt] = useState('demo-1')
  const [deposit, setDeposit] = useState('1000000')
  const [principal, setPrincipal] = useState('1000000')
  const [term, setTerm] = useState(36)
  const [transfer, setTransfer] = useState('1000')
  const [days, setDays] = useState('365')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const run = (action: (previous: EarnSimulation) => EarnSimulation, message: string) => {
    try { setState(action(state)); setError(''); setNotice(message) }
    catch (err) { setError(err instanceof Error ? err.message : 'Simulation rejected.'); setNotice('') }
  }
  let quote = 0
  try { quote = calculateEarnReward(Number(principal), term) } catch { /* invalid input shows no quote */ }
  const remaining = state.reserve - state.reserved - state.paid

  return (
    <section aria-labelledby="earn-title" className="space-y-4 rounded-xl border border-workspace-border bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Badge variant="amber">SIMULATION ONLY</Badge><h2 id="earn-title" className="mt-2 text-xl font-bold text-navy">MCC Earn Lab</h2><p className="text-sm text-gray-600">Test purchase eligibility, fixed-term locks and the reward budget with synthetic wallets.</p></div>
        <Button variant="secondary" onClick={() => { setState(createSimulation()); setReceipt('demo-1'); setError(''); setNotice('Scenario reset.') }}>Reset scenario</Button>
      </div>
      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No real tokens, wallets, trades or returns. Data is temporary and never saved to the member or financial ledger.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Available reserve', remaining], ['Reserved for locks', state.reserved], ['Simulated rewards paid', state.paid]].map(([label, value]) => <Card className="p-3" key={label}><p className="text-xs text-gray-600">{label}</p><p className="mt-1 break-all text-lg font-bold tabular-nums text-navy">{fmt(Number(value))} MCC</p></Card>)}
      </div>
      <progress className="h-2 w-full accent-gold" aria-label="Earn reserve committed or paid" value={state.reserved + state.paid} max={state.reserve} />
      <div className="grid gap-3 sm:grid-cols-2">
        {(['A', 'B'] as const).map(w => <Card className="p-4" key={w}><h3 className="font-semibold">Synthetic wallet {w}</h3><p className="text-sm text-gray-600">Available: {fmt(state.wallets[w].available)} MCC</p><p className="text-sm font-semibold text-emerald-700">Eligible to lock: {fmt(state.wallets[w].eligible)} MCC</p></Card>)}
      </div>
      <label className="block text-sm font-semibold">Active synthetic wallet<select className={selectClass} value={wallet} onChange={e => setWallet(e.target.value as Wallet)}><option value="A">Wallet A</option><option value="B">Wallet B</option></select></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <div className="grid items-start gap-3 md:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">1 · Simulate a deposit</h3>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(s => simulateDeposit(s, wallet, receipt, Number(deposit), source), 'Synthetic deposit recorded.') }}>
            <label className="block text-sm font-semibold">Source<select className={selectClass} value={source} onChange={e => setSource(e.target.value as Source)}><option value="dex">Verified DEX purchase (mock)</option><option value="membership">Membership allocation (not eligible)</option><option value="unverified">Unverified receipt (not eligible)</option></select></label>
            <Input label="Synthetic receipt ID" value={receipt} required maxLength={80} onChange={e => setReceipt(e.target.value)} />
            <Input label="Deposit MCC" type="number" min={1} step={1} required value={deposit} onChange={e => setDeposit(e.target.value)} />
            <Button type="submit">Record mock deposit</Button>
          </form>
        </Card>
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold">2 · Lock eligible MCC</h3>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(s => simulateLock(s, wallet, Number(principal), term), 'Simulated lock created; full reward reserved.') }}>
            <Input label="Principal MCC" type="number" min={1} step={1} required value={principal} onChange={e => setPrincipal(e.target.value)} />
            <label className="block text-sm font-semibold">Lock period<select className={selectClass} value={term} onChange={e => setTerm(Number(e.target.value))}>{EARN_TERMS.map(t => <option key={t.months} value={t.months}>{t.months} months · {t.aprBps / 100}% simple APR</option>)}</select></label>
            <div className="rounded-lg bg-slate-100 p-3 text-sm"><p>Projected reward: <strong>{fmt(quote)} MCC</strong></p><p className="text-gray-600">Whole-MCC rounding; paid at maturity only.</p></div>
            <Button type="submit">Create simulated lock</Button>
          </form>
        </Card>
        <Card className="space-y-3 p-4"><h3 className="font-semibold">3 · Test transfer eligibility</h3><form className="space-y-3" onSubmit={e => { e.preventDefault(); run(s => simulateTransfer(s, wallet, Number(transfer)), 'Simulated transfer complete; no new eligibility created.') }}><Input label="Transfer MCC" type="number" min={1} step={1} required value={transfer} onChange={e => setTransfer(e.target.value)} /><Button type="submit" variant="secondary">Transfer to wallet {wallet === 'A' ? 'B' : 'A'}</Button></form><p className="text-xs text-gray-600">Outgoing transfers consume eligibility first. Receiving wallets never gain eligibility from transfers.</p></Card>
        <Card className="space-y-3 p-4"><h3 className="font-semibold">4 · Advance the simulated clock</h3><p className="text-sm">Scenario date: <strong>{state.date}</strong></p><form className="space-y-3" onSubmit={e => { e.preventDefault(); run(s => advanceSimulation(s, Number(days)), 'Scenario time advanced.') }}><Input label="Days to advance" type="number" min={1} max={3650} step={1} required value={days} onChange={e => setDays(e.target.value)} /><Button type="submit" variant="secondary">Advance time</Button></form></Card>
      </div>
      <Card className="p-4"><h3 className="mb-3 font-semibold">Simulated lock positions</h3>{state.locks.length === 0 ? <p className="text-sm text-gray-600">No locks yet.</p> : <div className="space-y-3">{state.locks.map(l => <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm"><div><p className="font-semibold">#{l.id} · Wallet {l.wallet} · {fmt(l.principal)} MCC</p><p className="text-gray-600">{l.months} months · {l.aprBps / 100}% APR · {fmt(l.reward)} MCC reward</p><p className="text-gray-600">Matures {l.matures} · {l.claimed ? 'Claimed' : state.date >= l.matures ? 'Matured' : 'Locked'}</p></div><Button variant="secondary" disabled={l.claimed || state.date < l.matures || wallet !== l.wallet} onClick={() => run(s => simulateClaim(s, wallet, l.id), 'Simulated principal and reward returned.')}>Claim</Button></div>)}</div>}</Card>
    </section>
  )
}
