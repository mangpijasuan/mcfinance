import { notFound, redirect } from 'next/navigation'
import { getPrincipal } from '@/modules/auth'
import { rewardAccount, rewardsEnabled } from '@/modules/rewards'
import { PageHeader } from '@/components/portal/kit'
import RewardHistory from '@/components/portal/RewardHistory'

export default async function MemberRewardsPage() {
  if (!rewardsEnabled()) notFound()
  const principal = await getPrincipal()
  if (principal?.kind !== 'member') redirect('/portal/login')
  const account = await rewardAccount(principal.memberId)
  return (
    <div className="space-y-4">
      <PageHeader title="MC Rewards" sub="Your participation points and activity history." />
      <RewardHistory account={account} />
      <p className="text-sm text-gray-600">Pilot points have no cash value. Benefits and token conversion terms are under consideration.</p>
    </div>
  )
}
