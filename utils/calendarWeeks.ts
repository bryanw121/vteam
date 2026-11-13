/**
 * Week and month math for the Events calendar (#217, moved out of the Events
 * screen unchanged): the pager's page index <-> week start / month key, and the
 * dots for days with games. Pure, apart from the anchors taken at load.
 */
import { theme } from '../constants/theme'
import { addMonths } from './monthKeys'
import { eventLocalDateKey, localDateKey } from './index'
import type { EventWithDetails, MarkedDates } from '../types'

// Anchors for the week/month pager indexes only. "Today" itself comes from
// useToday() so it rolls over at midnight in an app left open (#195).
export const LOAD_DAY = localDateKey(new Date())

export const REF_WEEK  = getWeekStart(new Date())
export const REF_MONTH = LOAD_DAY.substring(0, 7)
export const WEEK_CENTER  = 52
export const MONTH_CENTER = 24

export function weekForIdx(i: number): Date {
  return offsetDate(REF_WEEK, (i - WEEK_CENTER) * 7)
}
export function idxForWeek(date: Date): number {
  return WEEK_CENTER + Math.round((date.getTime() - REF_WEEK.getTime()) / (7 * 86400000))
}
export function monthForIdx(i: number): string {
  return addMonths(REF_MONTH, i - MONTH_CENTER)
}
export function idxForMonth(month: string): number {
  const [ry, rm] = REF_MONTH.split('-').map(Number)
  const [y,  m ] = month.split('-').map(Number)
  return MONTH_CENTER + (y - ry) * 12 + (m - rm)
}



export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

export function getWeekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export function offsetDate(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function buildMarkedDates(events: EventWithDetails[], selectedDate: string): MarkedDates {
  const marks: MarkedDates = {}
  for (const event of events) {
    // Must be the viewer's local date, not the raw UTC slice — a 7pm CDT event
    // is stored as the next day in UTC and would dot the wrong square.
    const day = eventLocalDateKey(event.event_date)
    marks[day] = { marked: true, dotColor: theme.colors.primary }
  }
  marks[selectedDate] = {
    ...marks[selectedDate],
    selected: true,
    selectedColor: theme.colors.primary,
    selectedDotColor: theme.colors.white,
  }
  return marks
}
