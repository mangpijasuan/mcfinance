import { requireMember } from '@/modules/auth'
import { rewardAccount, rewardsEnabled } from '@/modules/rewards'
import { membershipAccrualEnabled, readMembershipProgress } from '@/modules/rewards/membership'

export async function GET() {
  const auth = await requireMember()
  if (auth.error) return auth.error
  if (!rewardsEnabled()) return Response.json({ error: 'Rewards are unavailable.' }, { status: 404 })
  const membership = membershipAccrualEnabled() ? {
    membershipAccrual: await readMembershipProgress(auth.principal.memberId),
  } : {}
  return Response.json({ ...await rewardAccount(auth.principal.memberId), ...membership }, { headers: { 'Cache-Control': 'private, no-store' } })
}
