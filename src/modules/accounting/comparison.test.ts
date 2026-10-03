import { describe, expect, it } from 'vitest'
import { M5_TARGET_DAYS, cleanStreak, isMonthEnd } from './comparison'

const days = (from: string, count: number, ok = true) => Array.from({ length: count }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + i)
  const runDate = d.toISOString().slice(0, 10)
  return { runDate, ok, ranOn: runDate }
})

describe('isMonthEnd', () => {
  it('knows the last day of each month, leap years included', () => {
    expect(['2026-01-31', '2026-02-28', '2028-02-29', '2026-04-30', '2026-12-31'].every(isMonthEnd)).toBe(true)
    expect(['2026-01-30', '2028-02-28', '2026-04-29', '2026-12-01'].some(isMonthEnd)).toBe(false)
  })
})

describe('cleanStreak', () => {
  it('is empty without runs', () => {
    expect(cleanStreak([], '2026-10-10')).toEqual({ days: 0, from: null, to: null, includesMonthEnd: false, met: false })
  })

  it('counts back from today, or from yesterday before today’s run', () => {
    const runs = days('2026-10-01', 9) // 1st–9th
    expect(cleanStreak(runs, '2026-10-09')).toMatchObject({ days: 9, from: '2026-10-01', to: '2026-10-09', includesMonthEnd: false })
    expect(cleanStreak(runs, '2026-10-10')).toMatchObject({ days: 9, to: '2026-10-09' }) // today has not run yet
    expect(cleanStreak(runs, '2026-10-11')).toMatchObject({ days: 0, to: null }) // yesterday was missed
  })

  it('stops at a day with differences, a day without a run, or a day with any failed run', () => {
    expect(cleanStreak([...days('2026-10-01', 3), { runDate: '2026-10-04', ok: false, ranOn: '2026-10-04' }, ...days('2026-10-05', 3)], '2026-10-07').days).toBe(3)
    expect(cleanStreak([...days('2026-10-01', 3), ...days('2026-10-05', 3)], '2026-10-07').days).toBe(3)
    // A failed run and a clean rerun on the same day: the day is not clean.
    expect(cleanStreak([...days('2026-10-01', 3), { runDate: '2026-10-03', ok: false, ranOn: '2026-10-03' }], '2026-10-03').days).toBe(0)
  })

  it('counts a day only if it was compared on that day; a backdated failure still breaks it', () => {
    const today = days('2026-10-08', 3) // 8th–10th, run on the day
    const backdated = ['2026-10-05', '2026-10-06', '2026-10-07'].map((runDate) => ({ runDate, ok: true, ranOn: '2026-10-10' }))
    expect(cleanStreak([...backdated, ...today], '2026-10-10')).toMatchObject({ days: 3, from: '2026-10-08' })
    expect(cleanStreak([...days('2026-10-05', 6), { runDate: '2026-10-07', ok: false, ranOn: '2026-10-10' }], '2026-10-10').days).toBe(3)
  })

  it('is met after 30 clean days that include a month-end', () => {
    const across = cleanStreak(days('2026-10-15', M5_TARGET_DAYS), '2026-11-13')
    expect(across).toMatchObject({ days: 30, from: '2026-10-15', includesMonthEnd: true, met: true })
    const within = cleanStreak(days('2026-10-01', 30), '2026-10-30') // 1st–30th: no month-end
    expect(within).toMatchObject({ days: 30, includesMonthEnd: false, met: false })
    expect(cleanStreak(days('2026-10-15', 29), '2026-11-12').met).toBe(false)
  })
})
