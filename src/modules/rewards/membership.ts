import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { OperationError } from '@/lib/operationError'
import { clubTimeZone, dateOnly, isoDateOf, todayIso } from '@/lib/dates'
import { type AuditContext, recordAudit } from '@/modules/audit'
import type { Actors } from '@/modules/approvals/actors'
import { elapsedDays, membershipProgress, MEMBERSHIP_MAX_ACCOUNTS } from './tenure'

type Tx = Prisma.TransactionClient

export function membershipAccrualEnabled() {
  return process.env.MC_REWARDS_ENABLED === 'true' && process.env.MC_MEMBERSHIP_ACCRUAL_ENABLED === 'true'
}

export async function readMembershipProgress(memberId: string) {
  const account = await prisma.membershipAccrual.findUnique({ where: { memberId } })
  return account ? membershipProgress(account, new Intl.DateTimeFormat('en-CA', {
    timeZone: account.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())) : null
}

/** What staff see before proposing a correction: the stored values, the history, and whether the join date has drifted. */
export async function readMembershipAudit(memberId: string) {
  const [account, member, history] = await Promise.all([
    prisma.membershipAccrual.findUnique({ where: { memberId } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { joinDate: true } }),
    prisma.membershipAccrualCorrection.findMany({ where: { memberId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 }),
  ])
  if (!account || !member) return { stored: null, joinDateDrift: false, history }
  const memberJoin = isoDateOf(member.joinDate)
  return {
    stored: { eligibleDays: account.eligibleDays, checkpoint: isoDateOf(account.checkpoint), joinDate: isoDateOf(account.joinDate), active: account.active },
    // The member record's join date was edited after the history was verified.
    joinDateDrift: memberJoin !== isoDateOf(account.joinDate) ? { memberRecord: memberJoin } : false,
    history,
  }
}

export type EnrollInput = { memberId: string; eligibleDays: number; verification: string }
export type CorrectInput = {
  memberId: string
  /** Days to add (positive) or take away (negative) from the stored verified days; 0 when only the join date is synced. */
  adjustmentDays: number
  /** The stored days the proposer saw: if they changed before approval, the request is refused. */
  expectedEligibleDays: number
  /** Adopt the member record's join date as the verified one. */
  syncJoinDate: boolean
  reason: string
}

/**
 * Checks a first verification of a member's history. Returns the account
 * when this exact verification is already recorded (a safe retry).
 */
export async function checkEnrollment(tx: Tx, input: EnrollInput) {
  // Reserve the lifetime allocation once for each enrolled member.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(63894021)::text`
  const rows = await tx.$queryRaw<{ status: string; joinDate: Date }[]>`
    SELECT status, "joinDate" FROM "Member" WHERE id = ${input.memberId} FOR UPDATE
  `
  if (!rows[0]) throw new OperationError(404, 'Member not found.')
  const existing = await tx.membershipAccrual.findUnique({ where: { memberId: input.memberId } })
  if (existing) {
    if (existing.eligibleDays === input.eligibleDays && existing.verification === input.verification) return { existing }
    throw new OperationError(400, 'Membership history is already verified. To change it, propose a correction.')
  }
  const checkpoint = dateOnly(todayIso())
  const joinDate = dateOnly(isoDateOf(rows[0].joinDate))
  if (joinDate > checkpoint || input.eligibleDays > elapsedDays(joinDate, checkpoint)) {
    throw new OperationError(400, 'Verified days cannot exceed elapsed membership.')
  }
  if (await tx.membershipAccrual.count() >= MEMBERSHIP_MAX_ACCOUNTS) {
    throw new OperationError(400, 'The membership allocation is fully reserved.')
  }
  return { existing: null, status: rows[0].status, joinDate, checkpoint }
}

/** Runs when the checker approves: records the verification and its permanent history entry. */
export async function enrollMembership(tx: Tx, input: EnrollInput, actors: Actors, ctx: AuditContext) {
  const checked = await checkEnrollment(tx, input)
  if (checked.existing) return checked.existing
  if (!actors.checker) throw new OperationError(409, 'A verification needs a second person.')
  const account = await tx.membershipAccrual.create({
    data: {
      memberId: input.memberId, joinDate: checked.joinDate, eligibleDays: input.eligibleDays, checkpoint: checked.checkpoint,
      active: checked.status === 'Active', timeZone: clubTimeZone(),
      verifiedBy: actors.maker.id, approvedBy: actors.checker.id, verification: input.verification,
    },
  })
  await tx.membershipAccrualCorrection.create({
    data: {
      memberId: input.memberId, kind: 'enroll', previousEligibleDays: null, newEligibleDays: account.eligibleDays,
      previousJoinDate: null, newJoinDate: account.joinDate, reason: input.verification,
      proposedBy: actors.maker.id, approvedBy: actors.checker.id,
    },
  })
  await recordAudit(tx, ctx, {
    action: 'rewards.membership_enroll', entityType: 'MembershipAccrual', entityId: input.memberId, after: account,
    metadata: { maker: actors.maker.id, checker: actors.checker.id },
  })
  return account
}

/** The state a correction would produce, or the reason it cannot be made. Holds the member's row. */
export async function checkCorrection(tx: Tx, input: CorrectInput) {
  const rows = await tx.$queryRaw<{ joinDate: Date }[]>`
    SELECT "joinDate" FROM "Member" WHERE id = ${input.memberId} FOR UPDATE
  `
  if (!rows[0]) throw new OperationError(404, 'Member not found.')
  const account = await tx.membershipAccrual.findUnique({ where: { memberId: input.memberId } })
  if (!account) throw new OperationError(400, 'Verify this member’s history first.')
  if (account.eligibleDays !== input.expectedEligibleDays) {
    throw new OperationError(409, 'The stored days changed since this was proposed. Look again and propose a new correction.')
  }
  const joinDate = input.syncJoinDate ? dateOnly(isoDateOf(rows[0].joinDate)) : account.joinDate
  const eligibleDays = account.eligibleDays + input.adjustmentDays
  if (input.adjustmentDays === 0 && joinDate.getTime() === account.joinDate.getTime()) {
    throw new OperationError(400, 'There is nothing to correct.')
  }
  if (joinDate > account.checkpoint || eligibleDays < 0 || eligibleDays > elapsedDays(joinDate, account.checkpoint)) {
    throw new OperationError(400, 'The corrected days must be between 0 and the days elapsed since the join date.')
  }
  return { account, joinDate, eligibleDays }
}

/** Runs when the checker approves: applies the correction and writes its permanent history entry. */
export async function correctMembership(tx: Tx, input: CorrectInput, actors: Actors, ctx: AuditContext) {
  const { account, joinDate, eligibleDays } = await checkCorrection(tx, input)
  if (!actors.checker) throw new OperationError(409, 'A correction needs a second person.')
  const updated = await tx.membershipAccrual.update({ where: { memberId: input.memberId }, data: { eligibleDays, joinDate } })
  const joinChanged = joinDate.getTime() !== account.joinDate.getTime()
  const correction = await tx.membershipAccrualCorrection.create({
    data: {
      memberId: input.memberId,
      kind: input.adjustmentDays !== 0 ? (joinChanged ? 'adjust_and_sync' : 'adjust') : 'sync_join_date',
      previousEligibleDays: account.eligibleDays, newEligibleDays: eligibleDays,
      previousJoinDate: account.joinDate, newJoinDate: joinDate, reason: input.reason,
      proposedBy: actors.maker.id, approvedBy: actors.checker.id,
    },
  })
  await recordAudit(tx, ctx, {
    action: 'rewards.membership_correct', entityType: 'MembershipAccrual', entityId: input.memberId,
    before: account, after: updated, metadata: { maker: actors.maker.id, checker: actors.checker.id, reason: input.reason, correctionId: correction.id },
  })
  return correction
}
