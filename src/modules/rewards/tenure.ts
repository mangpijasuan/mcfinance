import { dateOnly, type IsoDate } from '@/lib/dates'

export const MEMBERSHIP_MAX_POINTS = 1_000_000
export const MEMBERSHIP_ALLOCATION = 75_000_000_000
export const MEMBERSHIP_MAX_ACCOUNTS = MEMBERSHIP_ALLOCATION / MEMBERSHIP_MAX_POINTS

const DAY_MS = 86_400_000

export function elapsedDays(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS))
}

/** A February 29 anniversary falls on February 28 in a non-leap year. */
export function tenthAnniversary(joinDate: Date) {
  const year = joinDate.getUTCFullYear() + 10
  const month = joinDate.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(joinDate.getUTCDate(), lastDay)))
}

export function membershipProgress(
  account: { joinDate: Date; eligibleDays: number; checkpoint: Date; active: boolean },
  asOf: IsoDate,
) {
  const targetDays = elapsedDays(account.joinDate, tenthAnniversary(account.joinDate))
  const days = Math.min(targetDays, account.eligibleDays +
    (account.active ? elapsedDays(account.checkpoint, dateOnly(asOf)) : 0))
  const earned = Math.floor(days * MEMBERSHIP_MAX_POINTS / targetDays)
  return {
    earned, maximum: MEMBERSHIP_MAX_POINTS, eligibleDays: days, targetDays,
    nextDayPoints: account.active && days < targetDays
      ? Math.floor((days + 1) * MEMBERSHIP_MAX_POINTS / targetDays) - earned : 0,
    status: earned === MEMBERSHIP_MAX_POINTS ? 'complete' : account.active ? 'active' : 'paused',
    joinDate: account.joinDate.toISOString().slice(0, 10), asOf,
  }
}
