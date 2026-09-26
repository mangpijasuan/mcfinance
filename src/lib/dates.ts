// Calendar dates for money work. Due dates, payment dates and ledger dates
// are ISO calendar dates ("2026-03-10") in the club's time zone, so a
// payment recorded at 9 pm is never counted as the next day.

export type IsoDate = string

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The club's time zone (CLUB_TIME_ZONE, an IANA name). */
export function clubTimeZone(): string {
  return process.env.CLUB_TIME_ZONE || 'America/Chicago'
}

/** The calendar date of a moment, in the club's time zone. */
export function clubDateOf(moment: Date): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: clubTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment)
}

export function todayIso(now: Date = new Date()): IsoDate {
  return clubDateOf(now)
}

/**
 * The calendar date of a stored DateTime. A date-only value (midnight UTC,
 * as `new Date("2026-03-10")` and @db.Date columns give) keeps its date; a
 * real moment (e.g. "now" when a Zelle claim was confirmed) is converted
 * to the club's local date.
 */
export function isoDateOf(value: Date): IsoDate {
  if (value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0) {
    return value.toISOString().slice(0, 10)
  }
  return clubDateOf(value)
}

/** A @db.Date value for an ISO date. */
export function dateOnly(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && ISO_DATE.test(value) && dateOnly(value).toISOString().slice(0, 10) === value
}
