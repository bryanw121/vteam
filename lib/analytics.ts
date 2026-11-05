import { AppState, Platform } from 'react-native'
import { supabase } from './supabase'
import type { AnalyticsEventName, AnalyticsProps } from '../types'

/**
 * Lightweight usage metrics. `track(name, props)` buffers an event; the buffer
 * goes to `app_events` in one insert every FLUSH_MS, when the app goes to the
 * background, or when the web page is hidden. Best effort by design: it never
 * throws, drops a batch the server rejects instead of retrying, and switches
 * itself off if the table doesn't exist yet.
 *
 * Off under Jest, and in automated browsers (navigator.webdriver) so e2e runs
 * don't write rows, unless a test opts in with localStorage
 * `vteam.analytics = 'on'` (the metrics e2e does, and intercepts the insert).
 */

export const ANALYTICS_FLUSH_MS = 10_000
/** Oldest events are dropped beyond this (e.g. offline for a long time). */
const MAX_BUFFER = 200
/** Rows per insert. */
const MAX_BATCH = 50
const MAX_PROPS_CHARS = 900
const ANON_ID_KEY = 'vteam.anonId'
const OPT_IN_KEY = 'vteam.analytics'

type PendingEvent = { name: AnalyticsEventName; props: AnalyticsProps }

let buffer: PendingEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let flushing: Promise<void> | null = null
let listening = false
let disabled: boolean | null = null
let anonId: string | null = null
let anonIdLoading: Promise<string> | null = null

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

function isDisabled(): boolean {
  if (disabled !== null) return disabled
  let off = false
  try { off = typeof process !== 'undefined' && !!process.env?.JEST_WORKER_ID } catch { /* no process */ }
  try {
    if (!off && typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver) {
      off = webStorage()?.getItem(OPT_IN_KEY) !== 'on'
    }
  } catch { /* no navigator */ }
  disabled = off
  return off
}

function randomId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
    if (c?.randomUUID) return c.randomUUID()
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`
}

/** The random per-device id (created on first use, kept in local storage). */
function loadAnonId(): Promise<string> {
  if (anonId) return Promise.resolve(anonId)
  if (!anonIdLoading) {
    anonIdLoading = (async () => {
      const store = webStorage()
      try {
        if (store) {
          anonId = store.getItem(ANON_ID_KEY) || randomId()
          store.setItem(ANON_ID_KEY, anonId)
        } else if (Platform.OS !== 'web') {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
          anonId = (await AsyncStorage.getItem(ANON_ID_KEY)) || randomId()
          void AsyncStorage.setItem(ANON_ID_KEY, anonId).catch(() => {})
        }
      } catch { /* storage unavailable: per-session id */ }
      anonId ??= randomId()
      return anonId
    })()
  }
  return anonIdLoading
}

function listen(): void {
  if (listening) return
  listening = true
  try {
    AppState.addEventListener('change', state => { if (state !== 'active') void flush() })
    if (Platform.OS === 'web' && typeof document !== 'undefined' && typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush() })
      window.addEventListener('pagehide', () => void flush())
    }
  } catch { /* no listeners: the timer still flushes */ }
}

function schedule(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, ANALYTICS_FLUSH_MS)
}

/** Record one event. Never throws; a no-op when analytics is off. */
export function track(name: AnalyticsEventName, props: AnalyticsProps = {}): void {
  try {
    if (isDisabled()) return
    if (JSON.stringify(props).length > MAX_PROPS_CHARS) props = {}
    buffer.push({ name, props })
    if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER)
    listen()
    schedule()
  } catch { /* never break the app for metrics */ }
}

/** PostgREST / Postgres "no such table" (the migration isn't applied yet). */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST205' || error.code === '42P01'
    || (/app_events/.test(error.message ?? '') && /not find|does not exist/i.test(error.message ?? ''))
}

/** Send everything buffered now (one insert per MAX_BATCH events). Never throws. */
export function flush(): Promise<void> {
  if (flushing) return flushing
  if (timer) { clearTimeout(timer); timer = null }
  flushing = (async () => {
    try {
      const id = await loadAnonId()
      while (buffer.length && !disabled) {
        const batch = buffer.splice(0, MAX_BATCH).map(e => ({ name: e.name, props: e.props, anon_id: id, platform: Platform.OS }))
        const { error } = await supabase.from('app_events').insert(batch)
        if (error) {
          if (isMissingTable(error)) { disabled = true; buffer = [] }
          break // anything else: drop this batch, keep the rest for next time
        }
      }
    } catch { /* network etc.: dropped */ }
    finally {
      flushing = null
      if (buffer.length && !disabled) schedule()
    }
  })()
  return flushing
}

/** Test-only: reset module state; `enabled` overrides the Jest / webdriver switch. */
export function __resetAnalytics(opts: { enabled?: boolean } = {}): void {
  if (timer) clearTimeout(timer)
  buffer = []
  timer = null
  flushing = null
  anonId = null
  anonIdLoading = null
  disabled = opts.enabled === undefined ? null : !opts.enabled
}

/** Test-only. */
export function __bufferedEvents(): readonly PendingEvent[] {
  return buffer
}
