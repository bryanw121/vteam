/**
 * The Events feed request app/+html.tsx starts from the page's <head> (#184),
 * before the app bundle has loaded: on a cold server the connection pool and
 * schema cache warm up while the JS downloads instead of after it.
 *
 * The inline script leaves `window.__vteamPrefetch.feed`. useMonthEvents takes
 * it once, only when its first span and viewer match and it is under 15 s
 * old; otherwise (or if it failed) it fetches as usual.
 */
type FeedPrefetch = {
  start: string
  end: string
  /** The signed-in user whose token the request used, or null (anon key). */
  viewer: string | null
  /** Date.now() when the request started. */
  at: number
  /** Date.now() when the response arrived; null while it is in flight (#331). */
  doneAt?: number | null
  promise: Promise<unknown>
}

import type { FeedPrefetchTiming } from '../types'
import { readStoredSession } from './supabase'
import { reportRequest, TIMEOUT_MESSAGE } from './serverHealth'
import { HARD_TIMEOUT_MS, READ_TIMEOUT_MS } from '../utils/serverHealth'

const MAX_AGE_MS = 15_000

function slot(): { feed?: FeedPrefetch } | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { __vteamPrefetch?: { feed?: FeedPrefetch } }).__vteamPrefetch ?? null
}

/** Who the app will ask as: the stored session's user (the script used their token only if valid), else a guest. */
function storedViewer(): string | null {
  try { return readStoredSession()?.user?.id ?? null } catch { return null }
}

/**
 * The prefetched rows' promise if span and viewer match, else null. Either way
 * it is used up. A stored session whose token had expired means the script
 * asked as a guest: that doesn't match, so the app fetches for the user.
 */
export function takeFeedPrefetch(start: string, end: string, viewerId: string | null = storedViewer()): Promise<unknown> | null {
  const s = slot()
  const p = s?.feed
  if (!s || !p) return null
  delete s.feed
  if (p.start !== start || p.end !== end || p.viewer !== viewerId) return null
  if (Date.now() - p.at > MAX_AGE_MS) return null
  taken = { at: p.at, takenAt: Date.now(), slot: p }
  return withDeadline(p.promise, p.at + READ_TIMEOUT_MS, p.at + HARD_TIMEOUT_MS)
}

/**
 * The page's own request has no time limit (it starts before the app loads), so
 * give it the app's (#289): past READ_TIMEOUT_MS from its start it counts as a
 * timeout for the health state but is still waited for; past HARD_TIMEOUT_MS it
 * is given up on, like any read through the Supabase client.
 */
function withDeadline(promise: Promise<unknown>, softAt: number, hardAt: number): Promise<unknown> {
  let soft: ReturnType<typeof setTimeout> | null = null
  let hard: ReturnType<typeof setTimeout> | null = null
  let settled = false
  void promise.then(() => { settled = true }, () => { settled = true })
  soft = setTimeout(() => { if (!settled) reportRequest('timeout') }, Math.max(0, softAt - Date.now()))
  const late = new Promise<never>((_, reject) => {
    hard = setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), Math.max(0, hardAt - Date.now()))
  })
  return Promise.race([promise, late]).finally(() => {
    if (soft) clearTimeout(soft)
    if (hard) clearTimeout(hard)
  })
}

let taken: { at: number; takenAt: number; slot: FeedPrefetch } | null = null

/**
 * For feed_first_paint (#331), once the taken prefetch has settled: `serverMs`
 * is how long the page's own request took (start → response, the server and
 * the network), `bootMs` how long the app took to start and pick it up
 * (start → taken). Before #331 one number covered both and blamed the server.
 * Null if no prefetch was used.
 */
export function feedPrefetchTiming(): FeedPrefetchTiming | null {
  if (!taken) return null
  const done = taken.slot.doneAt
  return { serverMs: typeof done === 'number' ? done - taken.at : null, bootMs: taken.takenAt - taken.at, at: taken.at }
}
