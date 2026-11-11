import { EVENT_TIME_ZONE } from '../constants/time'
import type { MetricsPlatform, MetricsRangeDays, RetentionCohort } from '../types'

/**
 * Pure helpers for the admin Metrics screens (settings/metrics). Days are America/Chicago days,
 * like the admin_* functions.
 */

const DAY_MS = 86_400_000

/** YYYY-MM-DD of `date` in the club's time zone. */
export function chicagoDateKey(date: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: EVENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** The last `days` days, today included, as the `p_from` / `p_to` admin_metrics_overview takes. */
export function metricsRange(days: MetricsRangeDays, now: Date = new Date()): { from: string; to: string } {
  const to = chicagoDateKey(now)
  const [y, m, d] = to.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 1, d) - (days - 1) * DAY_MS).toISOString().slice(0, 10)
  return { from, to }
}

/** "Nov 7" for a YYYY-MM-DD day (no time zone shift: the day is already a calendar day). */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "Sat Nov 7" for a YYYY-MM-DD day. */
export function weekdayDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "7:42 PM" in the club's time zone. */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: EVENT_TIME_ZONE })
}

/** "Sep 14, 2026" in the club's time zone. */
export function joinedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: EVENT_TIME_ZONE })
}

/** Readable names for the screen types sessions report (route patterns and tab paths). */
const SCREEN_LABELS: Record<string, string> = {
  '/': 'Events',
  '/clubs': 'Clubs',
  '/chat': 'Chat',
  '/profile': 'Profile',
  '/event/[id]': 'Event page',
  '/club/[id]': 'Club page',
  '/chat/[id]': 'Conversation',
  '/profile/[id]': 'Player profile',
  '/tournament/[id]': 'Tournament',
  '/tournaments': 'Tournaments',
  '/leagues': 'Leagues',
  '/host': 'Host an event',
  '/book': 'Book a court',
  '/notifications': 'Notifications',
  '/welcome': 'Player setup',
  '/login': 'Sign in',
  '/register': 'Sign up',
  '/scorekeeper': 'Scorekeeper',
}

export function screenLabel(pattern: string | null | undefined): string {
  if (!pattern) return 'Unknown'
  const known = SCREEN_LABELS[pattern]
  if (known) return known
  if (pattern.startsWith('/settings/metrics')) return 'Admin metrics'
  if (pattern.startsWith('/settings')) return 'Settings'
  if (pattern.startsWith('/scorekeeper')) return 'Scorekeeper'
  return pattern
}

/** A session's path through the app: consecutive repeats dropped, at most `max` steps. */
export function screenPath(screens: readonly string[], max = 6): string {
  const steps: string[] = []
  for (const s of screens) {
    const label = screenLabel(s)
    if (steps[steps.length - 1] !== label) steps.push(label)
  }
  if (steps.length <= max) return steps.join(' → ')
  return [...steps.slice(0, max), '…'].join(' → ')
}

/** "6m 40s", "1h 5m", "45s"; "–" when unknown. */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '–'
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
}

/** "24 min" since `iso`, at least 1. */
export function minutesSince(iso: string, now: Date = new Date()): string {
  const min = Math.max(1, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000))
  return min < 60 ? `${min} min` : formatSeconds(min * 60)
}

/** "+2.1 vs prior 30 days", "−3 vs last week", "Same as last week"; null without a comparison. */
export function formatDelta(current: number | null, previous: number | null, label: string): string | null {
  if (current === null || previous === null) return null
  const diff = Math.round((current - previous) * 10) / 10
  if (diff === 0) return `Same as ${label}`
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs ${label}`
}

/** Whole percent of `part` in `whole`; null when `whole` is 0. */
export function percentOf(part: number, whole: number): number | null {
  if (!whole) return null
  return Math.round((part / whole) * 100)
}

export const PLATFORM_LABELS: Record<MetricsPlatform, string> = { ios: 'iOS', android: 'Android', web: 'Web' }

/** Platform shares, largest first, each as a whole percent of the people counted. */
export function platformShares(platforms: Partial<Record<MetricsPlatform, number>>): { platform: MetricsPlatform; label: string; people: number; percent: number }[] {
  const entries = (Object.keys(PLATFORM_LABELS) as MetricsPlatform[])
    .map(platform => ({ platform, people: platforms[platform] ?? 0 }))
    .filter(e => e.people > 0)
  const total = entries.reduce((n, e) => n + e.people, 0)
  return entries
    .sort((a, b) => b.people - a.people)
    .map(e => ({ ...e, label: PLATFORM_LABELS[e.platform], percent: percentOf(e.people, total) ?? 0 }))
}

/** "iOS 1.6.0", "Web", "Android" (no version known). */
export function platformVersion(platform: MetricsPlatform | null, version: string | null): string {
  if (!platform) return 'No sessions yet'
  return platform !== 'web' && version ? `${PLATFORM_LABELS[platform]} ${version}` : PLATFORM_LABELS[platform]
}

/** "Online now", "5 min ago", "2 h ago", "Yesterday", "3 days ago", then "Nov 2". */
export function lastSeenLabel(iso: string | null, online: boolean, now: Date = new Date()): string {
  if (online) return 'Online now'
  if (!iso) return 'Never opened the app'
  const diff = now.getTime() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${Math.max(1, min)} min ago`
  const h = Math.floor(min / 60)
  const today = chicagoDateKey(now)
  const day = chicagoDateKey(new Date(iso))
  if (day === today) return `${h} h ago`
  const days = Math.round((Date.parse(today) - Date.parse(day)) / DAY_MS)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return shortDay(day)
}

/** Whole days between two instants' calendar days (club time zone); 0 when either is missing. */
export function daysBetween(earlier: string | null, later: string | null): number {
  if (!earlier || !later) return 0
  return Math.round((Date.parse(chicagoDateKey(new Date(later))) - Date.parse(chicagoDateKey(new Date(earlier)))) / DAY_MS)
}

/** Retention offsets the admin_retention function reports, in weeks. */
export const RETENTION_WEEKS = ['w1', 'w2', 'w4', 'w8'] as const

/**
 * Cohorts with fewer than `min` sign-ups are merged into the next week (the last one into the
 * one before), so one person doesn't swing a cell. A merged cell is only known when every merged
 * week has a value. Weeks with no sign-ups never appear (the function skips them).
 */
export function mergeSmallCohorts(cohorts: readonly RetentionCohort[], min = 3): RetentionCohort[] {
  const merged: RetentionCohort[] = []
  let pending: RetentionCohort | null = null
  const add = (a: RetentionCohort, b: RetentionCohort): RetentionCohort => ({
    week: a.week,
    size: a.size + b.size,
    w1: a.w1 === null || b.w1 === null ? null : a.w1 + b.w1,
    w2: a.w2 === null || b.w2 === null ? null : a.w2 + b.w2,
    w4: a.w4 === null || b.w4 === null ? null : a.w4 + b.w4,
    w8: a.w8 === null || b.w8 === null ? null : a.w8 + b.w8,
  })
  for (const c of cohorts) {
    const cur: RetentionCohort = pending ? add(pending, c) : c
    if (cur.size < min) pending = cur
    else { merged.push(cur); pending = null }
  }
  if (pending) {
    const last = merged.pop()
    merged.push(last ? add(last, pending) : pending)
  }
  return merged
}

/** 0..3: how strong a retention cell reads (for its shade). */
export function retentionLevel(percent: number | null): 0 | 1 | 2 | 3 {
  if (percent === null) return 0
  if (percent >= 60) return 3
  if (percent >= 40) return 2
  return 1
}

/** 0..3: how much someone was on that day (for the active-days grid). */
export function activityLevel(minutes: number): 0 | 1 | 2 | 3 {
  if (minutes <= 0) return 0
  if (minutes < 10) return 1
  if (minutes < 30) return 2
  return 3
}

/** Monday-first weeks of the active-days grid; leading blanks so each row starts on a Monday. */
export function activeDayWeeks<T extends { day: string }>(days: readonly T[]): (T | null)[][] {
  if (!days.length) return []
  const [y, m, d] = days[0].day.split('-').map(Number)
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // Monday = 0
  const cells: (T | null)[] = [...Array<null>(weekday).fill(null), ...days]
  const weeks: (T | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const last = weeks[weeks.length - 1]
  while (last.length < 7) last.push(null)
  return weeks
}
