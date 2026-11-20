'use client'

import { useState } from 'react'
import { Button, Card, Input, PageHeader } from '@/components/ui'
import RewardHistory, { type RewardSummary } from '@/components/portal/RewardHistory'
import MembershipProgress, { type MembershipProgressData } from '@/components/portal/MembershipProgress'
import EarnSimulator from '@/components/staff/EarnSimulator'

type Account = RewardSummary & { member: { id: string; legalName: string; status: string }; membershipAccrual?: MembershipProgressData | null; maximumHistoricalDays?: number }

export default function RewardsAdmin({ earnSimulatorEnabled = false }: { earnSimulatorEnabled?: boolean }) {
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
      setNotice('Points entry recorded.')
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
      setNotice('Membership history verified.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify membership.')
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <PageHeader title="MC Rewards" sub="Record approved participation rewards and corrections." />
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
              {!account.membershipAccrual && (
                <Card className="p-4">
                  <h2 className="mb-3 font-semibold">Verify historical membership</h2>
                  <form onSubmit={enroll} className="space-y-3">
                    <p className="text-sm text-gray-600">Enter confirmed active days only. Maximum elapsed days: {account.maximumHistoricalDays}.</p>
                    <Input label="Verified active days" required type="number" min={0} max={account.maximumHistoricalDays} step={1} value={eligibleDays} onChange={e => setEligibleDays(e.target.value)} />
                    <Input label="Verification note" required maxLength={300} value={verification} onChange={e => setVerification(e.target.value)} />
                    <Button type="submit" disabled={busy}>Verify and enroll</Button>
                  </form>
                </Card>
              )}
            </div>
          )}
          <div className="grid items-start gap-4 md:grid-cols-2">
            <RewardHistory account={account} />
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">Record points</h2>
              <form onSubmit={record} className="space-y-3">
                <Input label="Activity reference" required maxLength={100} value={reference} onChange={e => setReference(e.target.value)} />
                <Input label="Reason" required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
                <Input label="Points (+ award, − correction)" required type="number" min={-1000} max={1000} step={1} value={points} onChange={e => setPoints(e.target.value)} />
                <p className="text-xs text-gray-600">Use the same activity reference when retrying an entry.</p>
                <Button type="submit" disabled={busy || account.member.status !== 'Active'}>{busy ? 'Working…' : 'Record points'}</Button>
              </form>
            </Card>
          </div>
        </>
      )}
      {earnSimulatorEnabled && <EarnSimulator />}
    </div>
  )
}
