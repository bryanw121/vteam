import { feedPrefetchTiming } from '../../lib/feedPrefetch'
import { browserAgent, isBotAgent } from '../../utils/botAgent'
import { landedOnFeed, msSinceOpen, track } from '../../lib/analytics'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { getQueryData, invalidate, setQueryData } from '../../lib/query'
import { isSafeStart } from '../../lib/crashRecovery'
import { addMonths, monthKeyFromIso } from '../../utils/monthKeys'
import { readFeedSnapshot, SNAPSHOT_MONTHS, writeFeedSnapshot } from '../../utils/feedSnapshot'
import { FEED_PREFIX, feedMonthKey, feedState, withMonths } from './state'
import type { AnalyticsProps, EventWithDetails } from '../../types'

// Device snapshot: paint last visit's events at once on a cold start, and say where the first rows came from.

/**
 * feed_first_paint (#184): when the first feed rows were in hand, and from
 * where. `ms` is since the launch was first on screen (`msSinceOpen`), sent only
 * when the launch opened on the feed (`landing`); someone who opens Events hours
 * into a visit would otherwise report hours (#326). For the page's own request
 * (prefetch), `server_ms` is start → response and `boot_ms` start → the app
 * took it (#331: before, `wait_ms` was the second and `cold` blamed the server
 * for the app's own start-up); for the app's fetch, `server_ms` is the wait.
 * `cold` marks a server over 1 s. `wait_ms` (prefetch: since the <head>
 * request started) stays until early December 2026 so the two can be compared,
 * then goes. `bot` labels a crawler-like browser (utils/botAgent). Once per launch.
 */
let firstPaintTracked = false
export function trackFirstPaint(source: 'snapshot' | 'prefetch' | 'fetch', startedAt?: number): void {
  if (firstPaintTracked) return
  firstPaintTracked = true
  const timing = source === 'prefetch' ? feedPrefetchTiming() : null
  const waitMs = timing ? Date.now() - timing.at
    : startedAt !== undefined ? Date.now() - startedAt : null
  const serverMs = timing ? timing.serverMs : source === 'fetch' ? waitMs : null
  const landing = landedOnFeed()
  const sinceOpen = msSinceOpen()
  const props: AnalyticsProps = { source, landing, cold: serverMs !== null && serverMs > 1000 }
  if (landing && sinceOpen !== null) props.ms = sinceOpen
  if (waitMs !== null) props.wait_ms = waitMs
  if (serverMs !== null) props.server_ms = serverMs
  if (timing) props.boot_ms = timing.bootMs
  if (isBotAgent(browserAgent())) props.bot = true
  track(ANALYTICS_EVENTS.feedFirstPaint, props)
}

/**
 * Seed the cache from the snapshot saved on the last visit (web; see
 * utils/feedSnapshot). Seeded months are marked stale, so the first read shows
 * them and refetches straight away. `feedState.owner` is set to the snapshot's viewer:
 * if someone else turns out to be signed in, the owner check in the hook resets
 * the feed before their RSVP state could show.
 */
export function seedFromSnapshot(): void {
  // Shortly after a crash nothing saved on the device is trusted (#316).
  if (isSafeStart()) return
  const snap = readFeedSnapshot()
  if (!snap) return
  trackFirstPaint('snapshot')
  const months = Object.keys(snap.months).sort()
  months.forEach(m => setQueryData(feedMonthKey(m), snap.months[m]))
  invalidate(FEED_PREFIX, { refetchActive: false })
  feedState.requestedMonths = withMonths(feedState.requestedMonths, months)
  feedState.owner = snap.owner
}

let snapshotTimer: ReturnType<typeof setTimeout> | null = null

/** After fresh data lands, save the first screen's months (current + next) for the next cold start. */
export function scheduleSnapshot(): void {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null
    if (feedState.owner === undefined) return
    const first = monthKeyFromIso(new Date().toISOString())
    const months: Record<string, EventWithDetails[]> = {}
    for (let i = 0; i < SNAPSHOT_MONTHS; i++) {
      const m = addMonths(first, i)
      const rows = getQueryData<EventWithDetails[]>(feedMonthKey(m))
      if (rows) months[m] = rows
    }
    if (Object.keys(months).length > 0) writeFeedSnapshot(feedState.owner, months)
  }, 1000)
}
