import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import { classifyRequest, HEALTHY, nextHealth, nextProbeDelay, offlineHealth, READ_TIMEOUT_MS, requestTimeoutMs, type RequestOutcome, type ServerHealth } from '../utils/serverHealth'

/**
 * Whether vteam's server is answering (#289), fed by every request the
 * Supabase client makes (`timedFetch`, below). Module-level like lib/toast, so
 * lib/query and lib/analytics read it directly. While `down`, focus refetches,
 * heartbeats and analytics flushes pause, ServerStatusBar says so, and a probe
 * (one tiny anon read) backs off from 15 s to 5 min; the first success makes it
 * `ok` again and runs the recovery listeners (stale screens refetch once).
 * Rules are pure in utils/serverHealth.
 */

let state: ServerHealth = HEALTHY
const listeners = new Set<() => void>()
const recoveredListeners = new Set<(downForMs: number, cause: ServerHealth['cause']) => void>()
let probeTimer: ReturnType<typeof setTimeout> | null = null
let probeAttempt = 0
let probing = false
let started = false

function set(next: ServerHealth): void {
  if (next === state) return
  const prev = state
  state = next
  listeners.forEach(fn => fn())
  if (next.status === 'down' && prev.status !== 'down') {
    probeAttempt = 0
    scheduleProbe()
  }
  if (next.status === 'ok' && prev.status !== 'ok') {
    stopProbe()
    if (prev.status === 'down') {
      const downFor = prev.since !== null ? Date.now() - prev.since : 0
      recoveredListeners.forEach(fn => { try { fn(downFor, prev.cause) } catch { /* a listener never breaks recovery */ } })
    }
  }
}

/** Record one request's outcome. Called by `timedFetch`. */
export function reportRequest(outcome: RequestOutcome): void {
  ensureStarted()
  set(nextHealth(state, outcome, Date.now()))
}

export function serverHealth(): ServerHealth {
  return state
}

/** True while the server (or the device's connection) is down: skip background traffic. */
export function isServerDown(): boolean {
  return state.status === 'down'
}

export function subscribeServerHealth(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Run `fn(downForMs, cause)` each time the state goes from down back to ok. */
export function onServerRecovered(fn: (downForMs: number, cause: ServerHealth['cause']) => void): () => void {
  recoveredListeners.add(fn)
  return () => { recoveredListeners.delete(fn) }
}

export function useServerHealth(): ServerHealth {
  return useSyncExternalStore(subscribeServerHealth, serverHealth, serverHealth)
}

/** When the next probe will run (ms since epoch), for "retrying in 30 s". Null when not probing. */
let nextProbeAt: number | null = null
export function nextProbeTime(): number | null {
  return nextProbeAt
}

function stopProbe(): void {
  if (probeTimer) { clearTimeout(probeTimer); probeTimer = null }
  nextProbeAt = null
}

function scheduleProbe(): void {
  stopProbe()
  const delay = nextProbeDelay(probeAttempt)
  nextProbeAt = Date.now() + delay
  probeTimer = setTimeout(() => { void probeNow() }, delay)
  listeners.forEach(fn => fn())
}

function pageHidden(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/**
 * One tiny anon read (app_config, already read at startup). Its outcome goes
 * through reportRequest like any request (the fetch is the timed one), so a
 * success recovers. Also what the bar's Retry does.
 */
export async function probeNow(): Promise<void> {
  if (probing) return
  if (pageHidden()) { scheduleProbe(); return }
  probing = true
  stopProbe()
  try {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) return
    const res = await timedFetch(`${url}/rest/v1/app_config?select=min_version&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }, READ_TIMEOUT_MS)
    await res.text().catch(() => '')
  } catch {
    // Reported by timedFetch.
  } finally {
    probing = false
    if (state.status === 'down') {
      probeAttempt++
      scheduleProbe()
    }
  }
}

/** Web: the browser's own offline / online events. */
function ensureStarted(): void {
  if (started) return
  started = true
  if (Platform.OS !== 'web' || typeof window === 'undefined') return
  try {
    window.addEventListener('offline', () => set(offlineHealth(state, Date.now())))
    window.addEventListener('online', () => { if (state.status !== 'ok') void probeNow() })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.status === 'down') void probeNow()
    })
  } catch { /* no listeners: requests still report */ }
}

/** Error message of a request our time limit cut off (lib/toast reads it as a server failure). */
export const TIMEOUT_MESSAGE = 'vteam request timed out'

/**
 * The Supabase client's fetch (lib/supabase `global.fetch`): the same request
 * with a time limit (utils/serverHealth `requestTimeoutMs`, or `timeoutMs`),
 * reporting how it went. The caller's own abort still works and counts as
 * nothing. A timeout rejects with TIMEOUT_MESSAGE.
 */
export async function timedFetch(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs?: number | null): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = init.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
  const limit = timeoutMs === undefined ? requestTimeoutMs(url, method) : timeoutMs
  const ours = new AbortController()
  let timedOut = false
  const timer = limit === null ? null : setTimeout(() => { timedOut = true; ours.abort() }, limit)
  const theirs = init.signal
  const onTheirAbort = () => ours.abort()
  if (theirs) {
    if (theirs.aborted) ours.abort()
    else theirs.addEventListener('abort', onTheirAbort)
  }
  try {
    const res = await fetch(input, { ...init, signal: ours.signal })
    reportRequest(classifyRequest({ status: res.status }))
    return res
  } catch (e) {
    if (timedOut) {
      reportRequest('timeout')
      throw new Error(TIMEOUT_MESSAGE)
    }
    if (!theirs?.aborted) reportRequest(classifyRequest({ status: null }))
    throw e
  } finally {
    if (timer) clearTimeout(timer)
    theirs?.removeEventListener('abort', onTheirAbort)
  }
}

/** Test-only. */
export function __resetServerHealth(): void {
  stopProbe()
  state = HEALTHY
  probeAttempt = 0
  probing = false
  listeners.clear()
  recoveredListeners.clear()
}
