import { prisma } from '@/lib/prisma'
import { clubTimeZone, dateOnly, isoDateOf, todayIso } from '@/lib/dates'
import { auditContext, recordAudit } from '@/modules/audit'
import type { StaffPrincipal } from '@/modules/auth'
import type { NextRequest } from 'next/server'
import { elapsedDays, membershipProgress, MEMBERSHIP_MAX_ACCOUNTS } from './tenure'

export function membershipAccrualEnabled() {
  return process.env.MC_REWARDS_ENABLED === 'true' && process.env.MC_MEMBERSHIP_ACCRUAL_ENABLED === 'true'
}

export async function readMembershipProgress(memberId: string) {
  const account = await prisma.membershipAccrual.findUnique({ where: { memberId } })
  return account ? membershipProgress(account, new Intl.DateTimeFormat('en-CA', {
    timeZone: account.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())) : null
}

export async function enrollMembershipAccrual(
  actor: StaffPrincipal, request: NextRequest, memberId: string,
  eligibleDays: number, verification: string,
) {
  return prisma.$transaction(async tx => {
    // Reserve the lifetime allocation once for each enrolled member.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(63894021)::text`
    const rows = await tx.$queryRaw<{ status: string; joinDate: Date }[]>`
      SELECT status, "joinDate" FROM "Member" WHERE id = ${memberId} FOR UPDATE
    `
    if (!rows[0]) return { error: 'Member not found.' }
    const existing = await tx.membershipAccrual.findUnique({ where: { memberId } })
    if (existing) {
      if (existing.eligibleDays === eligibleDays && existing.verification === verification) return { account: existing }
      return { error: 'Membership history is already verified.' }
    }
    const checkpoint = dateOnly(todayIso())
    const joinDate = dateOnly(isoDateOf(rows[0].joinDate))
    if (joinDate > checkpoint || eligibleDays > elapsedDays(joinDate, checkpoint)) {
      return { error: 'Verified days cannot exceed elapsed membership.' }
    }
    if (await tx.membershipAccrual.count() >= MEMBERSHIP_MAX_ACCOUNTS) {
      return { error: 'The membership allocation is fully reserved.' }
    }
    const account = await tx.membershipAccrual.create({
      data: {
        memberId, joinDate, eligibleDays, checkpoint, active: rows[0].status === 'Active',
        timeZone: clubTimeZone(), verifiedBy: actor.id, verification,
      },
    })
    await recordAudit(tx, auditContext(request, actor), {
      action: 'rewards.membership_enroll', entityType: 'MembershipAccrual', entityId: memberId, after: account,
    })
    return { account }
  })
}
