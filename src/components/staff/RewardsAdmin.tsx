'use client'

import { useState } from 'react'
import { Button, Card, Input, PageHeader } from '@/components/ui'
import RewardHistory, { type RewardSummary } from '@/components/portal/RewardHistory'
import MembershipProgress, { type MembershipProgressData } from '@/components/portal/MembershipProgress'
import EarnSimulator from '@/components/staff/EarnSimulator'

type Account = RewardSummary & { member: { id: string; legalName: string; status: string }; membershipAccrual?: MembershipProgressData | null; maximumHistoricalDays?: number; membershipAudit?: MembershipAudit }
type MembershipAudit = {
  stored: { eligibleDays: number; checkpoint: string; joinDate: string; active: boolean } | null
  joinDateDrift: false | { memberRecord: string }
  history: { id: string; kind: string; previousEligibleDays: number | null; newEligibleDays: number; reason: string; createdAt: string }[]
}

export default function RewardsAdmin({ earnSimulatorEnabled = false, canRecord = false }: { earnSimulatorEnabled?: boolean; canRecord?: boolean }) {
  const [memberId, setMemberId] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [points, setPoints] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [eligibleDays, setEligibleDays] = useState('')
  const [verification, setVerification] = useState('')
  const [adjustment, setAdjustment] = useState('')
  const [syncJoin, setSyncJoin] = useState(false)
  const [correctionReason, setCorrectionReason] = useState('')

  async function readAccount(id: string) {
    const res = await fetch('/api/rewards?memberId=' + encodeURIComponent(id))
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Unable to load rewards.')
    setAccount(data)
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setNotice(''); setAccount(null); setEligibleDays(''); setVerification('')
    try { await readAccount(memberId.trim()) }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load rewards.') }
    finally { setBusy(false) }
  }

  async function record(e: React.FormEvent) {
    e.preventDefault()
    if (!account) return
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/rewards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: account.member.id, reference, reason, points: Number(points) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to record points.')
      setNotice(data.approvalRequest
        ? `Sent for approval (${data.approvalRequest.publicId}). The points are added when someone else approves it in Approvals.`
        : 'Points entry already recorded.')
      await readAccount(account.member.id)
      setReference(''); setReason(''); setPoints('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the result. Retry with the same activity reference.')
    } finally { setBusy(false) }
  }

  async function enroll(e: React.FormEvent) {
    e.preventDefault()
    if (!account) return
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/rewards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enroll-membership', memberId: account.member.id, eligibleDays: Number(eligibleDays), verification }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to verify membership.')
      await readAccount(account.member.id)
      setNotice(`Sent for approval (${data.approvalRequest?.publicId ?? 'already recorded'}). The history is verified when someone else approves it in Approvals.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify membership.')
    } finally { setBusy(false) }
  }

  async function correct(e: React.FormEvent) {
    e.preventDefault()
    const stored = account?.membershipAudit?.stored
    if (!account || !stored) return
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/rewards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'correct-membership', memberId: account.member.id, adjustmentDays: Number(adjustment || 0),
          expectedEligibleDays: stored.eligibleDays, syncJoinDate: syncJoin, reason: correctionReason,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to propose the correction.')
      setNotice(`Correction sent for approval (${data.approvalRequest?.publicId}). Nothing changes until someone else approves it in Approvals.`)
      setAdjustment(''); setSyncJoin(false); setCorrectionReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to propose the correction.')
    } finally { setBusy(false) }
  }

  const audit = account?.membershipAudit
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <PageHeader title="MC Rewards" sub="Propose participation rewards and corrections; a second person approves each one." />
      <Card className="p-4">
        <form onSubmit={search} className="flex flex-wrap items-end gap-3">
          <Input label="Member ID" required value={memberId} onChange={e => setMemberId(e.target.value)} />
          <Button type="submit" disabled={busy}>Find member</Button>
        </form>
      </Card>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {account && (
        <>
          <h2 className="font-semibold">{account.member.legalName} · {account.member.id} · {account.member.status}</h2>
          {account.membershipAccrual !== undefined && (
            <div className="grid items-start gap-4 md:grid-cols-2">
              <MembershipProgress progress={account.membershipAccrual} />
              {canRecord && !account.membershipAccrual && (
                <Card className="p-4">
                  <h2 className="mb-3 font-semibold">Verify historical membership</h2>
                  <form onSubmit={enroll} className="space-y-3">
                    <p className="text-sm text-gray-600">Enter confirmed active days only. Maximum elapsed days: {account.maximumHistoricalDays}.</p>
                    <Input label="Verified active days" required type="number" min={0} max={account.maximumHistoricalDays} step={1} value={eligibleDays} onChange={e => setEligibleDays(e.target.value)} />
                    <Input label="Verification note" required maxLength={300} value={verification} onChange={e => setVerification(e.target.value)} />
                    <Button type="submit" disabled={busy}>Send for approval</Button>
                  </form>
                </Card>
              )}
            </div>
          )}
          {canRecord && audit?.stored && (
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">Correct membership history</h2>
              <p className="mb-3 text-sm text-gray-600">Verified days stored: <strong>{audit.stored.eligibleDays}</strong> (as of {audit.stored.checkpoint}); join date used: {audit.stored.joinDate}. A correction needs a reason with its evidence, and a second person approves it.</p>
              {audit.joinDateDrift && <p role="status" className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">The member record now says they joined on {audit.joinDateDrift.memberRecord}, which differs from the verified join date. Tick the box to adopt it.</p>}
              <form onSubmit={correct} className="space-y-3">
                <Input label="Days to add (+) or take away (−)" type="number" step={1} value={adjustment} onChange={e => setAdjustment(e.target.value)} />
                {audit.joinDateDrift && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={syncJoin} onChange={e => setSyncJoin(e.target.checked)} /> Adopt the member record’s join date</label>}
                <Input label="Reason and evidence" required maxLength={300} value={correctionReason} onChange={e => setCorrectionReason(e.target.value)} />
                <Button type="submit" disabled={busy}>Send correction for approval</Button>
              </form>
            </Card>
          )}
          {audit && audit.history.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">History of verification and corrections</h2>
              <ul className="space-y-2 text-sm">
                {audit.history.map(h => (
                  <li key={h.id} className="border-b border-gray-100 pb-2">
                    <span className="font-medium">{h.kind === 'enroll' ? 'Verified' : 'Corrected'}</span>: {h.previousEligibleDays === null ? '' : `${h.previousEligibleDays} → `}{h.newEligibleDays} days · {new Date(h.createdAt).toLocaleDateString('en-US')}
                    <span className="block text-gray-600">{h.reason}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="grid items-start gap-4 md:grid-cols-2">
            <RewardHistory account={account} />
            {canRecord ? <Card className="p-4">
              <h2 className="mb-3 font-semibold">Propose points</h2>
              <form onSubmit={record} className="space-y-3">
                <Input label="Activity reference" required maxLength={100} value={reference} onChange={e => setReference(e.target.value)} />
                <Input label="Reason" required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
                <Input label="Points (+ award, − correction)" required type="number" min={-1000} max={1000} step={1} value={points} onChange={e => setPoints(e.target.value)} />
                <p className="text-xs text-gray-600">Use the same activity reference when retrying an entry.</p>
                <Button type="submit" disabled={busy || account.member.status !== 'Active'}>{busy ? 'Working…' : 'Send for approval'}</Button>
              </form>
            </Card> : <Card className="p-4"><p className="text-sm text-gray-600">You can view points. Proposing them needs the Finance role.</p></Card>}
          </div>
        </>
      )}
      {earnSimulatorEnabled && <EarnSimulator />}
    </div>
  )
}
