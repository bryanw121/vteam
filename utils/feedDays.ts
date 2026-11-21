import type { DesktopFeedMonth, FeedDaySection } from '../types'
import { formatDate } from './dateFormat'

const DAY_LABEL: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
const MONTH_LABEL: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }

/** A `YYYY-MM-DD` day as a local date (no time-zone shift). */
function localDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "Thu, Nov 19". */
export function dayLabel(date: string): string {
  return formatDate(localDay(date), DAY_LABEL)
}

/**
 * The desktop feed's months, each split into its days (#feed-by-day). Days
 * keep the screen's order and their hidden counts, so "N hidden · Show" sits
 * under the day it belongs to. Days with nothing to show or hide are left out.
 */
export function desktopFeedMonths(sections: readonly FeedDaySection[], today: string): DesktopFeedMonth[] {
  const months: DesktopFeedMonth[] = []
  for (const section of sections) {
    if (section.data.length === 0 && section.hiddenCount === 0) continue
    const month = section.date.substring(0, 7)
    let entry = months[months.length - 1]
    if (!entry || entry.month !== month) {
      const label = formatDate(localDay(`${month}-01`), MONTH_LABEL)
      entry = { month, label: month === today.substring(0, 7) ? `${label} · This month` : label, days: [] }
      months.push(entry)
    }
    entry.days.push({ ...section, label: dayLabel(section.date), isToday: section.date === today })
  }
  return months
}

/** "4 games", "1 game". */
export function gamesCount(n: number): string {
  return n === 1 ? '1 game' : `${n} games`
}

/**
 * A busy day shows its first `limit` games until it is opened. `more` is the
 * button under them, or null when everything already fits.
 */
export function collapseDay<T>(items: readonly T[], limit: number, open: boolean, label: string): { shown: readonly T[]; more: string | null } {
  if (items.length <= limit) return { shown: items, more: null }
  if (open) return { shown: items, more: 'Show fewer' }
  return { shown: items.slice(0, limit), more: `Show ${items.length - limit} more on ${label.split(',')[0]}` }
}

/**
 * The day to scroll to when a date is picked: that day, or the next one with
 * games on it (an empty day has no section). null when nothing that late is loaded yet.
 */
export function dayToScrollTo(days: readonly string[], picked: string): string | null {
  return days.find(d => d >= picked) ?? null
}
