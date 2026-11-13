/**
 * The Events calendar's week and month math (#217, utils/calendarWeeks.ts):
 * page index <-> week start / month, and the dots for days with games. Runs in
 * every CI time zone (npm run test:tz).
 */
import {
  buildMarkedDates, getWeekDays, getWeekStart, idxForMonth, idxForWeek, monthForIdx, offsetDate,
  MONTH_CENTER, REF_MONTH, REF_WEEK, WEEK_CENTER, weekForIdx,
} from '../utils/calendarWeeks'
import { localDateKey } from '../utils'
import { theme } from '../constants/theme'
import { DST_DAYS, localDate } from './helpers/clock'
import type { EventWithDetails } from '../types'

describe('getWeekStart / getWeekDays / offsetDate', () => {
  it('starts weeks on Sunday at local midnight', () => {
    const start = getWeekStart(localDate(2026, 11, 13, 18, 30)) // a Friday evening
    expect(localDateKey(start)).toBe('2026-11-08')
    expect([start.getHours(), start.getMinutes()]).toEqual([0, 0])
  })

  it('lists seven local days, across a DST change', () => {
    const days = getWeekDays(getWeekStart(new Date(`${DST_DAYS.fallBack}T12:00:00`)))
    expect(days.map(localDateKey)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'])
    expect(days.every(d => d.getHours() === 0)).toBe(true)
  })

  it('moves by calendar days', () => {
    expect(localDateKey(offsetDate(localDate(2026, 12, 30), 3))).toBe('2027-01-02')
    expect(localDateKey(offsetDate(localDate(2026, 3, 1), -1))).toBe('2026-02-28')
  })
})

describe('week pages', () => {
  it('the centre page is this week', () => {
    expect(weekForIdx(WEEK_CENTER).getTime()).toBe(REF_WEEK.getTime())
    expect(idxForWeek(REF_WEEK)).toBe(WEEK_CENTER)
  })

  it('round-trips pages either side, including over DST weeks', () => {
    for (const i of [WEEK_CENTER - 30, WEEK_CENTER - 1, WEEK_CENTER + 1, WEEK_CENTER + 20, WEEK_CENTER + 51]) {
      const week = weekForIdx(i)
      expect(week.getDay()).toBe(0)
      expect(idxForWeek(week)).toBe(i)
    }
  })
})

describe('month pages', () => {
  it('the centre page is this month', () => {
    expect(monthForIdx(MONTH_CENTER)).toBe(REF_MONTH)
    expect(idxForMonth(REF_MONTH)).toBe(MONTH_CENTER)
  })

  it('round-trips across year ends', () => {
    for (const i of [0, MONTH_CENTER - 13, MONTH_CENTER + 1, MONTH_CENTER + 14, MONTH_CENTER * 2]) {
      expect(idxForMonth(monthForIdx(i))).toBe(i)
    }
  })
})

describe('buildMarkedDates', () => {
  const event = (event_date: string) => ({ event_date }) as EventWithDetails

  it('dots each day with a game on the viewer’s local date and marks the selected day', () => {
    const evening = localDate(2026, 11, 14, 19) // local 7 PM; the next day in UTC for US zones
    const marks = buildMarkedDates([event(evening.toISOString())], '2026-11-15')
    expect(marks['2026-11-14']).toEqual({ marked: true, dotColor: theme.colors.primary })
    expect(marks['2026-11-15']).toEqual({ selected: true, selectedColor: theme.colors.primary, selectedDotColor: theme.colors.white })
  })

  it('a selected day with games keeps its dot', () => {
    const noon = localDate(2026, 11, 14, 12)
    expect(buildMarkedDates([event(noon.toISOString())], '2026-11-14')['2026-11-14']).toMatchObject({ marked: true, selected: true })
  })
})
