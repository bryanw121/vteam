import { AppState, Platform } from 'react-native'
import { supabase } from './supabase'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { currentAppVersion } from '../utils/appVersion'
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
 *
 * Sessions and online now (usage metrics design, Nov 2026): `startUsageTracking()` (root
 * layout, once) opens a session (a random id kept in memory) and, while the app is open and
 * visible, calls `app_heartbeat` once a minute with the session, device, platform, app version
 * and the screen type now on (`noteScreen`). A new session starts on launch, after 30 minutes
 * hidden or in the background, and when the signed-in account changes (`setUsageUser`). Every
 * event carries its session id and the app version. A player can turn all of it off for their
 * device (Settings → Privacy, `setUsageSharing(false)`); it stays off under Jest and in
 * automated browsers like the events.
 */

export const ANALYTICS_FLUSH_MS = 10_000
/** Oldest events are dropped beyond this (e.g. offline for a long time). */
const MAX_BUFFER = 200
/** Rows per insert. */
const MAX_BATCH = 50
const MAX_PROPS_CHARS = 900
const ANON_ID_KEY = 'vteam.anonId'
const OPT_IN_KEY = 'vteam.analytics'
/** 'off' when the player turned off Share usage data on this device. */
export const USAGE_SHARING_KEY = 'vteam.usageSharing'
/** Back after longer than this hidden / in the background = a new session. */
export const SESSION_IDLE_MS = 30 * 60_000
export const HEARTBEAT_MS = 60_000

type PendingEvent = { name: AnalyticsEventName; props: AnalyticsProps; session: string | null }

let buffer: PendingEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let flushing: Promise<void> | null = null
let listening = false
let disabled: boolean | null = null
let anonId: string | null = null
let anonIdLoading: Promise<string> | null = null

/** The open session; null before startUsageTracking() or after opting out. */
let session: { id: string; userId: string | null } | null = null
let sessionUser: string | null = null
let hiddenAt: number | null = null
let visible = false
let started = false
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let heartbeatMissing = false
let screen: string | null = null
/** Opt-out, read from device storage (null = not read yet; native storage is async). */
let sharingOff: boolean | null = null
let sharingLoading: Promise<boolean> | null = null

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

/** Whether the player turned usage sharing off on this device (read once, then cached). */
function loadSharingOff(): Promise<boolean> {
  if (sharingOff !== null) return Promise.resolve(sharingOff)
  if (!sharingLoading) {
    sharingLoading = (async () => {
      let off = false
      try {
        const store = webStorage()
        if (store) off = store.getItem(USAGE_SHARING_KEY) === 'off'
        else if (Platform.OS !== 'web') {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
          off = (await AsyncStorage.getItem(USAGE_SHARING_KEY)) === 'off'
        }
      } catch { /* unreadable: sharing stays on */ }
      sharingOff = off
      return off
    })()
  }
  return sharingLoading
}

/** Share usage data on this device (Settings → Privacy). */
export async function isUsageSharingOn(): Promise<boolean> {
  return !(await loadSharingOff())
}

/** Turn usage sharing on or off for this device. Off drops anything not yet sent and stops heartbeats. */
export async function setUsageSharing(on: boolean): Promise<void> {
  sharingOff = !on
  sharingLoading = Promise.resolve(!on)
  try {
    const store = webStorage()
    if (store) store.setItem(USAGE_SHARING_KEY, on ? 'on' : 'off')
    else if (Platform.OS !== 'web') {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
      await AsyncStorage.setItem(USAGE_SHARING_KEY, on ? 'on' : 'off')
    }
  } catch { /* kept for this run only */ }
  if (!on) {
    buffer = []
    stopHeartbeat()
    session = null
  } else if (started && visible) {
    openSession(false)
    void heartbeat()
    startHeartbeat()
  }
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
    buffer.push({ name, props, session: session?.id ?? null })
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
      if (await loadSharingOff()) buffer = []
      const version = currentAppVersion()
      while (buffer.length && !disabled) {
        const batch = buffer.splice(0, MAX_BATCH).map(e => ({
          name: e.name, props: e.props, anon_id: id, platform: Platform.OS, session_id: e.session, app_version: version,
        }))
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

/**
 * Whether coming back should open a new session: none yet, the account changed, or the app was
 * hidden / in the background for longer than SESSION_IDLE_MS. Pure; exported for tests.
 */
export function needsNewSession(
  current: { userId: string | null } | null,
  userId: string | null,
  hiddenSince: number | null,
  now: number,
): boolean {
  if (!current) return true
  if (current.userId !== userId) return true
  return hiddenSince !== null && now - hiddenSince > SESSION_IDLE_MS
}

/** The screen type a route stands for: groups and `index` dropped, params kept as written (`/event/[id]`). Pure. */
export function screenPattern(segments: readonly string[]): string {
  const parts = segments.filter(s => !(s.startsWith('(') && s.endsWith(')')) && s !== 'index')
  return '/' + parts.join('/')
}

function webReferrer(): string | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null
  try {
    const ref = document.referrer
    if (!ref) return 'direct'
    const host = new URL(ref).host
    if (typeof window !== 'undefined' && host === window.location.host) return 'internal'
    return /google|bing|duckduckgo|yahoo/.test(host) ? 'search' : 'link'
  } catch { return null }
}

function openSession(cold: boolean): void {
  if (isDisabled() || sharingOff) return
  session = { id: randomId(), userId: sessionUser }
  const props: AnalyticsProps = { cold }
  if (cold) {
    const ref = webReferrer()
    if (ref) props.referrer = ref
  }
  track(ANALYTICS_EVENTS.sessionStart, props)
}

/** One heartbeat for the open session. Never throws; stops for good if the function is missing. */
async function heartbeat(): Promise<void> {
  try {
    if (isDisabled() || heartbeatMissing || !visible || !session) return
    if (await loadSharingOff()) return
    const id = await loadAnonId()
    const current = session
    if (!current) return
    const { error } = await supabase.rpc('app_heartbeat', {
      p_session: current.id,
      p_anon: id,
      p_platform: Platform.OS,
      p_version: currentAppVersion(),
      p_screen: screen ?? undefined,
    })
    if (error && (error.code === 'PGRST202' || /app_heartbeat/.test(error.message ?? ''))) heartbeatMissing = true
  } catch { /* offline etc.: the next one tries again */ }
}

function startHeartbeat(): void {
  stopHeartbeat()
  heartbeatTimer = setInterval(() => { void heartbeat() }, HEARTBEAT_MS)
}

function stopHeartbeat(): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
}

function onShown(): void {
  if (visible) return
  visible = true
  const cold = !session
  if (needsNewSession(session, sessionUser, hiddenAt, Date.now())) openSession(cold)
  hiddenAt = null
  void heartbeat()
  startHeartbeat()
}

function onHidden(): void {
  if (!visible) return
  visible = false
  hiddenAt = Date.now()
  stopHeartbeat()
  void flush()
}

/**
 * Open the first session and keep heartbeats going while the app is visible. Call once, from the
 * root layout, after the session (signed-in user) is known. A no-op when analytics is off.
 */
export function startUsageTracking(userId: string | null): void {
  try {
    if (started || isDisabled()) return
    started = true
    sessionUser = userId
    AppState.addEventListener('change', state => { if (state === 'active') onShown(); else onHidden() })
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHidden(); else onShown() })
    }
    const shown = Platform.OS === 'web' && typeof document !== 'undefined'
      ? document.visibilityState !== 'hidden'
      : AppState.currentState === 'active' || AppState.currentState == null
    void loadSharingOff().then(() => { if (shown) onShown() })
  } catch { /* never break the app for metrics */ }
}

/** The signed-in account changed (sign in / out): the next activity is a new session. */
export function setUsageUser(userId: string | null): void {
  if (userId === sessionUser) return
  sessionUser = userId
  if (!started || !visible || !session) return
  openSession(false)
  void heartbeat()
}

/** The screen type now on (`screenPattern`, or a tab's path); records a screen_view when it changes. */
export function noteScreen(pattern: string): void {
  try {
    if (pattern === screen) return
    const from = screen
    screen = pattern
    track(ANALYTICS_EVENTS.screenView, from ? { screen: pattern, from } : { screen: pattern })
  } catch { /* never break the app for metrics */ }
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
  stopHeartbeat()
  session = null
  sessionUser = null
  hiddenAt = null
  visible = false
  started = false
  heartbeatMissing = false
  screen = null
  sharingOff = null
  sharingLoading = null
}

/** Test-only: the open session. */
export function __usageSession(): { id: string; userId: string | null } | null {
  return session
}

/** Test-only. */
export function __bufferedEvents(): readonly PendingEvent[] {
  return buffer
}
