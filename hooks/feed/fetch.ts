import { EXTERNAL_SESSION_MAX_AGE_MS } from '../../constants'
import { supabase } from '../../lib/supabase'
import { takeFeedPrefetch } from '../../lib/feedPrefetch'
import { localDateKey } from '../../utils'
import { sessionConfirmation } from '../../utils/externalFreshness'
import { bucketByMonthKey, enumerateMonths, monthEndIso, monthStartIso } from '../../utils/monthKeys'
import { previewsFromRows, withEventCardPreviews } from '../../utils/eventCardPreviews'
import { isFeedRpcUnavailable, parseFeedSpan } from '../../utils/feedSpan'
import { TIMEOUT_MESSAGE } from '../../lib/serverHealth'
import { normalizeExternalSessions, normalizeTournaments } from '../../utils/feedItems'
import { feedMonthKey, feedState } from './state'
import { hydratePreviewsWhenLanded } from './previews'
import { scheduleSnapshot, trackFirstPaint } from './startup'
import { fetchFeedSpanQueries } from './fallback'
import type { EventCardPreviews, EventWithDetails, ExternalSession, FeedSpanRows } from '../../types'

// Fetching the feed: one batched span per tick, through get_feed_span or the three-query fallback.

/** What one span fetch produced. `previews` is set when they came with the rows (the RPC), so no second round trip is needed. */
type FeedSpanFetch = {
  buckets: Record<string, EventWithDetails[]>
  previews: EventCardPreviews | null
}

/**
 * Whether to try `get_feed_span` first. Turned off for the rest of the session
 * the first time the server says the function is missing or can't run (see
 * isFeedRpcUnavailable), so a client shipped before the migration pays for
 * that once, not on every fetch.
 */
let feedRpcEnabled = true

/** Merge the three sources, newest previews applied, sorted and bucketed by local month. Pure. */
export function bucketFeed(
  span: string[],
  events: EventWithDetails[],
  tournaments: unknown[] | null,
  external: ExternalSession[] | null,
  previews: EventCardPreviews,
): Record<string, EventWithDetails[]> {
  const combined = [
    ...withEventCardPreviews(events, previews),
    ...normalizeTournaments(tournaments),
    // Outside sessions whose source hasn't been read for a week are left out (utils/externalFreshness).
    ...normalizeExternalSessions((external ?? []).filter(s => sessionConfirmation(s, localDateKey(new Date())).state !== 'hidden')),
  ]
  combined.sort((a, b) => a.event_date.localeCompare(b.event_date))
  return bucketByMonthKey(combined, span)
}

/**
 * The request app/+html.tsx started from the page's <head> for this span and
 * viewer (#184), if any: its rows, or null to fetch as usual (no match, too
 * old, or it failed: a failed prefetch never shows an error).
 */
async function adoptFeedPrefetch(rangeStart: string, rangeEnd: string): Promise<unknown | null> {
  const pending = takeFeedPrefetch(rangeStart, rangeEnd)
  if (!pending) return null
  try {
    return await pending
  } catch (e) {
    // The server didn't answer in time: asking again now only waits again (#289).
    if (e instanceof Error && e.message === TIMEOUT_MESSAGE) throw e
    return null
  }
}

/**
 * The whole span in one request. Returns null when the RPC can't be used (the
 * caller then runs the three queries); latches it off for the session when the
 * error says it will keep failing.
 */
async function fetchFeedSpanRpc(rangeStart: string, rangeEnd: string, externalSince: string): Promise<FeedSpanRows | null> {
  const prefetched = await adoptFeedPrefetch(rangeStart, rangeEnd)
  if (prefetched !== null) {
    const rows = parseFeedSpan(prefetched)
    if (rows) {
      trackFirstPaint('prefetch')
      return rows
    }
  }
  const startedAt = Date.now()
  const { data, error } = await supabase.rpc('get_feed_span', {
    p_start: rangeStart,
    p_end: rangeEnd,
    p_external_updated_since: externalSince,
  })
  if (error) {
    // A timeout isn't a missing function: the separate queries would only wait on the same server (#289).
    if (error.message?.includes(TIMEOUT_MESSAGE)) throw new Error(TIMEOUT_MESSAGE)
    if (isFeedRpcUnavailable(error)) feedRpcEnabled = false
    console.warn('[useMonthEvents] get_feed_span unavailable, using separate queries:', error.message)
    return null
  }
  const rows = parseFeedSpan(data)
  if (rows) trackFirstPaint('fetch', startedAt)
  if (!rows) {
    feedRpcEnabled = false
    console.warn('[useMonthEvents] get_feed_span returned an unexpected shape, using separate queries')
  }
  return rows
}

/**
 * Everything dated `startMonth..endMonth`, bucketed by local month: one
 * `get_feed_span` call (rows + avatar previews), or, while that isn't
 * available, the three-query path with previews to follow. Throws if the
 * club's events could not be read.
 */
async function fetchFeedSpan(startMonth: string, endMonth: string): Promise<FeedSpanFetch> {
  const span = enumerateMonths(startMonth, endMonth)
  const rangeStart = monthStartIso(span[0])
  const rangeEnd = monthEndIso(span[span.length - 1])
  const externalSince = new Date(Date.now() - EXTERNAL_SESSION_MAX_AGE_MS).toISOString()

  if (feedRpcEnabled) {
    const rows = await fetchFeedSpanRpc(rangeStart, rangeEnd, externalSince)
    if (rows) {
      const ids = rows.events.map(e => e.id)
      const previews = previewsFromRows(rows.previews, ids)
      for (const id of ids) feedState.lastPreviews.set(id, previews.get(id) ?? [])
      return { buckets: bucketFeed(span, rows.events, rows.tournaments, rows.external, previews), previews }
    }
  }

  const { events, tournaments, external } = await fetchFeedSpanQueries(rangeStart, rangeEnd, externalSince)
  return { buckets: bucketFeed(span, events, tournaments, external, feedState.lastPreviews), previews: null }
}

type MonthWaiter = {
  month: string
  resolve: (events: EventWithDetails[]) => void
  reject: (e: unknown) => void
}

let queue: MonthWaiter[] = []

/**
 * The per-month `useQuery` fetcher. Months requested in the same tick (one
 * render's slots, one `invalidate('feed')`, one pull-to-refresh) are fetched
 * together as a single span.
 */
export function fetchFeedMonth(month: string): Promise<EventWithDetails[]> {
  return new Promise((resolve, reject) => {
    queue.push({ month, resolve, reject })
    if (queue.length === 1) queueMicrotask(flushQueue)
  })
}

function flushQueue(): void {
  const batch = queue
  queue = []
  if (batch.length === 0) return
  const months = [...new Set(batch.map(w => w.month))].sort()
  fetchFeedSpan(months[0], months[months.length - 1]).then(
    ({ buckets, previews }) => {
      // Previews that didn't come with the rows follow in a second round trip.
      // Subscribe before resolving, so the cache writes these trigger are seen.
      if (!previews) hydratePreviewsWhenLanded(new Map(months.map(m => [feedMonthKey(m), buckets[m] ?? []])))
      batch.forEach(w => w.resolve(buckets[w.month] ?? []))
      scheduleSnapshot()
    },
    e => batch.forEach(w => w.reject(e)),
  )
}

/** Test-only. */
export function __resetFeedFetch(): void {
  queue = []
  feedRpcEnabled = true
}
