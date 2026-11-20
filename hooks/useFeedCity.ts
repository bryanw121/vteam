import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { STALE } from '../constants'
import { WHERE_API_PATH, WHERE_CLIENT_TIMEOUT_MS } from '../constants/feedRegions'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { shareUrl } from '../constants/share'
import { track } from '../lib/analytics'
import { pickedFeedRegion, setPickedFeedRegion, subscribeFeedRegion } from '../lib/feedRegionStore'
import { queryKey, useQuery } from '../lib/query'
import { feedRegionName, isFeedRegion, regionSlug, resolveFeedRegion } from '../utils/feedRegion'
import type { FeedCity, FeedRegionId } from '../types/feedRegion'
import { useUserSettings } from './useUserSettings'

export const WHERE_KEY = queryKey('where')

/**
 * The covered city nearest this viewer's network, from the app's own `/api/where` (the page's
 * origin on web, `WEB_ORIGIN` on native). Null when unknown, too far, or the host has no such
 * function (a static server answers with index.html). Never throws.
 */
export async function fetchNearestRegion(): Promise<FeedRegionId | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), WHERE_CLIENT_TIMEOUT_MS)
  try {
    const res = await fetch(shareUrl(WHERE_API_PATH), { signal: ctrl.signal })
    if (res.status !== 200 || !(res.headers.get('content-type') ?? '').includes('json')) return null
    const body = (await res.json()) as { region?: unknown } | null
    return isFeedRegion(body?.region) ? body.region : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Which city's outside games this viewer sees, why, and how to change it (#339). Order: a city
 * picked on this device; the profile's home city when vteam covers it; the nearest covered city
 * to the viewer's network; Austin. The network is only asked when the first two don't settle it.
 */
export function useFeedCity(): FeedCity {
  const { settings } = useUserSettings()
  const picked = useSyncExternalStore(subscribeFeedRegion, pickedFeedRegion, () => null)
  const homeCity = settings?.home_city?.city_name ?? null
  const settled = !!picked || isFeedRegion(homeCity ? regionSlug(homeCity) : null)
  const where = useQuery(WHERE_KEY, fetchNearestRegion, { staleMs: STALE.where, enabled: !settled })
  const located = where.data ?? null
  const { region, source } = resolveFeedRegion({ picked, homeCity, located })

  const pick = useCallback((next: FeedRegionId, how: 'list' | 'device') => {
    setPickedFeedRegion(next)
    track(ANALYTICS_EVENTS.feedCityChanged, { region: next, how })
  }, [])

  return useMemo(
    () => ({ region, name: feedRegionName(region), source, nearest: located, pick }),
    [region, source, located, pick],
  )
}

/** Just the region id, for hooks that filter by it (the feed, programs, search). */
export function useFeedRegion(): string {
  return useFeedCity().region
}
