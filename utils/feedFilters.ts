import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SURFACE_OPTIONS } from '../constants/events'
import type { FeedFilter, StoredFeedFilters, SurfaceFilter } from '../types'

/**
 * The Events tab's chip and surface filters, remembered on this device so a
 * person comes back to the view they left. A per-viewer convenience only: web
 * reads localStorage synchronously (restored before the first paint), native
 * loads AsyncStorage once in the background. Every access is guarded; storage
 * that is missing, blocked or corrupt just means the defaults.
 */
const STORAGE_KEY = 'vteam.feedFilters'

export const DEFAULT_FEED_FILTERS: StoredFeedFilters = { filter: 'all', surface: 'any' }

/** Chip ids the feed understands today. A stored id not in here (e.g. the removed 'austin' or 'not_full') is dropped. */
const FEED_FILTERS: readonly FeedFilter[] = ['mine', 'all', 'open_play', 'tournament']
const SURFACE_FILTERS: readonly SurfaceFilter[] = ['any', ...SURFACE_OPTIONS.map(o => o.id)]

let cached: StoredFeedFilters | null = null
let loading: Promise<StoredFeedFilters> | null = null

/** Stored JSON → filters; each field that is missing or no longer valid falls back to its default. Pure. */
export function parseFeedFilters(raw: string | null | undefined): StoredFeedFilters {
  let value: unknown = null
  try {
    value = raw ? JSON.parse(raw) : null
  } catch {
    return DEFAULT_FEED_FILTERS
  }
  if (!value || typeof value !== 'object') return DEFAULT_FEED_FILTERS
  const v = value as Record<string, unknown>
  return {
    filter: FEED_FILTERS.includes(v.filter as FeedFilter) ? (v.filter as FeedFilter) : DEFAULT_FEED_FILTERS.filter,
    surface: SURFACE_FILTERS.includes(v.surface as SurfaceFilter) ? (v.surface as SurfaceFilter) : DEFAULT_FEED_FILTERS.surface,
  }
}

/**
 * The chip to show: 'mine' means nothing without an account or without an
 * upcoming event of one's own, so those viewers get 'all' (the choice stays
 * saved, and Mine comes back once they have an event).
 */
export function usableFeedFilter(filter: FeedFilter, signedIn: boolean, hasOwnEvents = true): FeedFilter {
  return filter === 'mine' && (!signedIn || !hasOwnEvents) ? 'all' : filter
}

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** The saved filters if known without waiting: always on web, on native once loaded. */
export function feedFiltersNow(): StoredFeedFilters | null {
  if (cached) return cached
  const store = webStorage()
  if (store) {
    try { cached = parseFeedFilters(store.getItem(STORAGE_KEY)) } catch { cached = DEFAULT_FEED_FILTERS }
    return cached
  }
  return Platform.OS === 'web' ? (cached = DEFAULT_FEED_FILTERS) : null
}

/** The saved filters, loading them from AsyncStorage on native the first time. Never rejects. */
export function loadFeedFilters(): Promise<StoredFeedFilters> {
  const now = feedFiltersNow()
  if (now) return Promise.resolve(now)
  if (!loading) {
    loading = (async () => {
      try {
        const stored = parseFeedFilters(await AsyncStorage.getItem(STORAGE_KEY))
        // A choice made while this was loading wins over the stored one.
        if (!cached) cached = stored
      } catch {
        if (!cached) cached = DEFAULT_FEED_FILTERS
      }
      return cached
    })()
  }
  return loading
}

/** Remember `filters` for the next visit. Fire-and-forget; failures are ignored. */
export function saveFeedFilters(filters: StoredFeedFilters): void {
  cached = filters
  const json = JSON.stringify(filters)
  const store = webStorage()
  if (store) {
    try { store.setItem(STORAGE_KEY, json) } catch { /* private mode / quota: not remembered */ }
    return
  }
  if (Platform.OS === 'web') return
  try {
    void AsyncStorage.setItem(STORAGE_KEY, json).catch(() => {})
  } catch { /* not remembered */ }
}

/** Test-only. */
export function __resetFeedFilters(): void {
  cached = null
  loading = null
}
