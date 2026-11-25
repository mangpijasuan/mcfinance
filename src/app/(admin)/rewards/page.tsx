import { notFound } from 'next/navigation'
import { getPrincipal } from '@/modules/auth'
import { rewardsEnabled } from '@/modules/rewards'
import RewardsAdmin from '@/components/staff/RewardsAdmin'

export default async function RewardsPage() {
  const principal = await getPrincipal()
  if (!rewardsEnabled() || principal?.kind !== 'staff' || !principal.mfaVerified || !principal.permissions.has('rewards.read')) notFound()
  return <RewardsAdmin canRecord={principal.permissions.has('rewards.record')} earnSimulatorEnabled={process.env.MC_EARN_SIMULATOR_ENABLED === 'true'} />
}
