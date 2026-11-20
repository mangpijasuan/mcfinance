export type RewardSummary = {
  balance: number
  entries: { id: string; points: number; reason: string; createdAt: string | Date }[]
}

export default function RewardHistory({ account }: { account: RewardSummary }) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-workspace-chrome p-5 text-white">
        <p className="text-sm text-white/85">Available MC Points</p>
        <p className="mt-2 text-4xl font-semibold tabular-nums text-gold">{account.balance.toLocaleString('en-US')}</p>
        <p className="mt-2 text-sm text-white/80">Member participation rewards</p>
      </section>
      <section className="overflow-hidden rounded-lg border border-workspace-border bg-white">
        <h2 className="border-b border-workspace-border bg-workspace-header px-4 py-3 font-semibold">Recent activity (up to 100)</h2>
        {account.entries.length === 0 ? <p className="p-5 text-sm text-gray-600">No points activity yet.</p> :
          <ul className="divide-y divide-gray-200">
            {account.entries.map(entry => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{entry.reason}</p>
                  <p className="text-xs text-gray-600">{new Date(entry.createdAt).toISOString().slice(0, 10)}</p>
                </div>
                <span className={entry.points > 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-gray-700'}>
                  {entry.points > 0 ? '+' : ''}{entry.points}
                </span>
              </li>
            ))}
          </ul>}
      </section>
    </div>
  )
}
