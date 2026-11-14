import { Platform } from 'react-native'
import type { QuerySnapshot } from '../types'
import { getQueryData, invalidate, removeQueries, setQueryData, subscribeQueryCache } from './query'

/**
 * Last visit's small, per-viewer reads (own profile, points, badges, settings,
 * ad-free status, chat list...), kept on the device so a cold start paints them
 * at once instead of waiting on the network. The Events feed has its own
 * snapshot (utils/feedSnapshot); this is everything around it. Web only for now:
 * localStorage is synchronous, so the cache is seeded before the first render.
 *
 * Like the feed snapshot it is a display hint, never a source of truth: every
 * seeded entry is stale, so its first reader refetches at once; it is dropped
 * if it belongs to someone else (see `snapshotOwner` / useCacheUserScope), is
 * from an older format, or is too old.
 */
const STORAGE_KEY = 'vteam.querySnapshot'
/**
 * Bump whenever a snapshotted read changes shape: a copy saved by the previous
 * build is then dropped instead of handed to code that expects the new shape.
 * 2: `ads:feed` changed from `{ banners, sponsoredEventIds }` to the startup
 * config (#280), and the old copy crashed the Events feed on open (Nov 13).
 */
const VERSION = 2
/** Profile-ish data changes slowly; a week-old copy is still a better first paint than a spinner. */
export const QUERY_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** Never let it fill the origin's storage quota. */
const MAX_BYTES = 300_000
const WRITE_DELAY_MS = 1000
/** lib/query's key separator. */
const SEP = ':'

/**
 * Cache prefixes worth keeping. Only reads a returning viewer sees on the first
 * screens (Events header, Profile, Chat list). Not here: 'feed' (own snapshot),
 * 'event' / 'tournament' / 'club' detail pages (opened on demand).
 */
export const SNAPSHOT_PREFIXES = [
  'profile',
  'points',
  'badges',
  'cheers',
  'trophies',
  'settings',
  'adfree',
  'ads',
  'tags',
  'conversations',
  'chatSilences',
  'external-programs', // public listings (Tournaments, Leagues): safe on a shared device
  // The viewer's club tournaments (key tournaments:list:<user>), so Tournaments paints complete
  // instead of pushing the outside list down when they arrive (#288). Only ever shown to that viewer.
  'tournaments:list',
] as const

/** Entries kept smaller than the read (the tournament list reads up to 200 rows). */
const SNAPSHOT_TRIM: Partial<Record<(typeof SNAPSHOT_PREFIXES)[number], (data: unknown) => unknown>> = {
  'tournaments:list': data => (Array.isArray(data) ? data.slice(0, TOURNAMENT_LIST_SNAPSHOT_ROWS) : data),
}
/** Newest start dates first, so this keeps every upcoming tournament and the latest past ones. */
export const TOURNAMENT_LIST_SNAPSHOT_ROWS = 40

/** What the snapshot stores for `key`: the cached value, trimmed where a prefix asks for it. */
export function snapshotValue(key: string, data: unknown): unknown {
  const prefix = SNAPSHOT_PREFIXES.find(p => key === p || key.startsWith(p + SEP))
  const trim = prefix ? SNAPSHOT_TRIM[prefix] : undefined
  return trim ? trim(data) : data
}

function storage(): Storage | null {
  if (Platform.OS !== 'web') return null
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function isSnapshotKey(key: string): boolean {
  return SNAPSHOT_PREFIXES.some(p => key === p || key.startsWith(p + SEP))
}

/** Pure validity check (unit tested). */
export function usableQuerySnapshot(raw: unknown, now = Date.now()): QuerySnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<QuerySnapshot>
  if (s.v !== VERSION || typeof s.savedAt !== 'number' || now - s.savedAt > QUERY_SNAPSHOT_MAX_AGE_MS || s.savedAt > now + 60_000) return null
  if (!(s.owner === null || typeof s.owner === 'string')) return null
  if (!s.entries || typeof s.entries !== 'object' || Array.isArray(s.entries)) return null
  const entries = Object.entries(s.entries).filter(([key, value]) => isSnapshotKey(key) && value !== undefined)
  if (entries.length === 0) return null
  return { v: VERSION, savedAt: s.savedAt, owner: s.owner, entries: Object.fromEntries(entries) }
}

export function readQuerySnapshot(): QuerySnapshot | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    return raw ? usableQuerySnapshot(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function clearQuerySnapshot(): void {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}

/**
 * Whose data was seeded: `undefined` = nothing seeded. useCacheUserScope compares
 * it with the restored session and drops the seeded entries if they differ.
 */
let seededOwner: string | null | undefined
/** Who the cache currently belongs to, for writing. `undefined` until the session is known. */
let currentOwner: string | null | undefined
const liveKeys = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let started = false

export function snapshotOwner(): string | null | undefined {
  return seededOwner
}

/** Drop everything the snapshot seeded (another viewer turned out to be signed in) and refetch what's on screen. */
export function discardSeededSnapshot(): void {
  seededOwner = undefined
  SNAPSHOT_PREFIXES.forEach(p => removeQueries(p))
  SNAPSHOT_PREFIXES.forEach(p => invalidate(p))
}

function write(): void {
  timer = null
  const store = storage()
  if (!store || currentOwner === undefined) return
  const entries: Record<string, unknown> = {}
  liveKeys.forEach(key => {
    const data = getQueryData<unknown>(key)
    if (data !== undefined) entries[key] = snapshotValue(key, data)
  })
  try {
    if (Object.keys(entries).length === 0) {
      store.removeItem(STORAGE_KEY)
      return
    }
    const json = JSON.stringify({ v: VERSION, savedAt: Date.now(), owner: currentOwner, entries } satisfies QuerySnapshot)
    if (json.length > MAX_BYTES) {
      store.removeItem(STORAGE_KEY)
      return
    }
    store.setItem(STORAGE_KEY, json)
  } catch {
    // Quota or private mode: the snapshot is only a speed-up.
  }
}

function scheduleWrite(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(write, WRITE_DELAY_MS)
}

/**
 * The signed-in viewer is known (or changed). From now on the snapshot is
 * written for them; entries fetched for someone else were already dropped by
 * useCacheUserScope.
 */
export function setSnapshotOwner(owner: string | null): void {
  if (currentOwner !== undefined && currentOwner !== owner) {
    // Someone else now: forget the previous viewer's copy on this device too.
    liveKeys.clear()
    clearQuerySnapshot()
  }
  currentOwner = owner
  if (seededOwner !== undefined && seededOwner !== owner) seededOwner = undefined
  if (liveKeys.size > 0) scheduleWrite()
}

/** Seed the cache from the last visit and start saving fresh reads. Idempotent; call once at startup. */
export function startQuerySnapshot(): void {
  if (started || !storage()) return
  started = true
  const snap = readQuerySnapshot()
  if (snap) {
    Object.entries(snap.entries).forEach(([key, data]) => {
      setQueryData(key, data)
      liveKeys.add(key)
    })
    // Seeded = stale: the first reader shows it and refetches straight away.
    SNAPSHOT_PREFIXES.forEach(p => invalidate(p, { refetchActive: false }))
    seededOwner = snap.owner
  }
  subscribeQueryCache(key => {
    if (!isSnapshotKey(key)) return
    liveKeys.add(key)
    scheduleWrite()
  })
}

/** Test-only. */
export function __resetQuerySnapshot(): void {
  seededOwner = undefined
  currentOwner = undefined
  liveKeys.clear()
  if (timer) clearTimeout(timer)
  timer = null
  started = false
}
