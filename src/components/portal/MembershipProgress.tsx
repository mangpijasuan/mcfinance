import type { membershipProgress } from '@/modules/rewards/tenure'

export type MembershipProgressData = ReturnType<typeof membershipProgress>

export default function MembershipProgress({ progress }: { progress: MembershipProgressData | null }) {
  if (!progress) return (
    <section className="rounded-lg border border-workspace-border bg-white p-4">
      <h2 className="font-semibold">Membership accumulation</h2>
      <p className="mt-2 text-sm text-gray-600">Awaiting verification of membership history.</p>
    </section>
  )
  const percent = 100 * progress.earned / progress.maximum
  return (
    <section className="space-y-4 rounded-lg border border-workspace-border bg-white p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Ten-year membership accumulation</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-navy">{progress.earned.toLocaleString('en-US')}</p>
        <p className="text-sm text-gray-600">of {progress.maximum.toLocaleString('en-US')} membership points</p>
      </div>
      <progress className="h-3 w-full accent-gold" value={progress.earned} max={progress.maximum} aria-label="Membership reward progress" />
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-gray-600">Progress</p><p className="font-semibold">{percent.toFixed(2)}%</p></div>
        <div><p className="text-gray-600">Next day</p><p className="font-semibold">{progress.nextDayPoints} points</p></div>
        <div><p className="text-gray-600">Member since</p><p className="font-semibold">{progress.joinDate}</p></div>
        <div><p className="text-gray-600">Status</p><p className="font-semibold capitalize">{progress.status}</p></div>
      </div>
      <p className="text-xs text-gray-600">As of {progress.asOf}. Internal membership points have no cash value or guaranteed token conversion.</p>
    </section>
  )
}
