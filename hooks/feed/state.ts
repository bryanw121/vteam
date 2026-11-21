import { invalidate, queryKey, removeQueries } from '../../lib/query'
import type { EventCardPreviews } from '../../types'

/** Module state of the Events feed (#343): it outlives the screen, like the query cache. */

export const FEED_PREFIX = 'feed'
/** Upper bound on months the feed holds at once (2 years of scrolling). */
export const MAX_FEED_MONTHS = 24

export function feedMonthKey(month: string): string {
  return queryKey(FEED_PREFIX, 'month', month)
}

export const feedState: {
  /** Months the feed has asked for, sorted. Restored on remount so scrolled-in months come back too. */
  requestedMonths: string[]
  /** Last avatar previews per event id: painted with the next fetch so avatars don't flicker out on refresh. */
  lastPreviews: EventCardPreviews
  /** The user the cached rows were fetched for (`my_attendance` is viewer-scoped). `undefined` = not yet known. */
  owner: string | null | undefined
} = {
  requestedMonths: [],
  lastPreviews: new Map(),
  owner: undefined,
}

/** `current` plus the months in `add` it lacks, sorted, at most `MAX_FEED_MONTHS`. Same array when nothing is added. */
export function withMonths(current: string[], add: string[]): string[] {
  const missing = add.filter(m => !current.includes(m))
  if (missing.length === 0) return current
  return [...current, ...missing].sort().slice(0, MAX_FEED_MONTHS)
}

/** Drop every cached month and refetch the ones on screen — e.g. the signed-in user changed. */
export function resetFeed(): void {
  removeQueries(FEED_PREFIX)
  invalidate(FEED_PREFIX)
}
