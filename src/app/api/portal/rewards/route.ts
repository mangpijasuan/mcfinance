import { requireMember } from '@/modules/auth'
import { rewardAccount, rewardsEnabled } from '@/modules/rewards'

export async function GET() {
  const auth = await requireMember()
  if (auth.error) return auth.error
  if (!rewardsEnabled()) return Response.json({ error: 'Rewards are unavailable.' }, { status: 404 })
  return Response.json(await rewardAccount(auth.principal.memberId), { headers: { 'Cache-Control': 'private, no-store' } })
}
