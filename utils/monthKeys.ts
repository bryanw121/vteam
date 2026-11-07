import { eventLocalDateKey } from './index'

/** `'2026-08'` + n months → `'2026-11'`. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = (m - 1) + n
  const newY = y + Math.floor(total / 12)
  const newM = ((total % 12) + 12) % 12 + 1
  return `${newY}-${String(newM).padStart(2, '0')}`
}

/**
 * Month bounds as UTC instants, derived from *local* midnight.
 *
 * `Date.UTC(y, m - 1, 1)` treats the calendar boundary as UTC midnight, which
 * cuts the month in the wrong place for any viewer at a non-zero offset: a
 * Jan 31 9pm CST event is Feb 1 in UTC, so it was fetched with February and
 * went missing from the January view. Constructing a local Date instead pins
 * the boundary to the month the viewer actually sees.
 */
export function monthStartIso(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString()
}

export function monthEndIso(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 1, 0, 0, 0, 0).toISOString()
}

/** Inclusive `startMonth` through inclusive `endMonth`, sorted. */
export function enumerateMonths(startMonth: string, endMonth: string): string[] {
  if (endMonth < startMonth) return []
  const out: string[] = []
  let cur = startMonth
  while (cur <= endMonth) {
    out.push(cur)
    cur = addMonths(cur, 1)
    if (out.length > 36) break
  }
  return out
}

export function monthKeyFromIso(iso: string): string {
  return eventLocalDateKey(iso).substring(0, 7)
}

export function bucketByMonthKey<T extends { event_date: string }>(
  items: T[],
  months: string[],
): Record<string, T[]> {
  const buckets: Record<string, T[]> = {}
  for (const m of months) buckets[m] = []
  for (const item of items) {
    const key = monthKeyFromIso(item.event_date)
    if (buckets[key]) buckets[key].push(item)
  }
  return buckets
}

/** True when the events tab actually left and came back, not an Expo Router remount. */
export function shouldRefreshEventsOnFocus(
  blurredAtMs: number | null,
  nowMs: number,
  minBlurMs = 400,
): boolean {
  return blurredAtMs != null && nowMs - blurredAtMs >= minBlurMs
}

/**
 * Month label for the week that starts on `weekStart` (local midnight):
 * "November 2026". A week that runs into a new month is labelled with the new
 * month (Nov 29 – Dec 5 → "December 2026").
 */
export function weekMonthLabel(weekStart: Date): string {
  const end = new Date(weekStart)
  end.setDate(weekStart.getDate() + 6)
  return end.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
