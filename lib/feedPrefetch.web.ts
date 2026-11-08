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
  promise: Promise<unknown>
}

import { readStoredSession } from './supabase'

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
  lastTakenAt = p.at
  return p.promise
}

let lastTakenAt: number | null = null

/** When the taken prefetch started (Date.now()), for feed_first_paint; null if none was used. */
export function feedPrefetchAge(): number | null {
  return lastTakenAt
}
