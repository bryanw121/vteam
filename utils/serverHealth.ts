/**
 * Is vteam's server answering? Pure rules for lib/serverHealth (#289), unit-tested.
 *
 * During the 2026-11-12 outage every request waited about 90 s before failing,
 * saved screens gave no hint, and open tabs kept sending heartbeats into the
 * dead server. `timedFetch` (lib/serverHealth) now cuts requests off, and every outcome is fed
 * through `nextHealth`: one failure makes the state `degraded`, a second within
 * a minute makes it `down` (the bar shows, background traffic pauses, a probe
 * backs off), and any success makes it `ok` again.
 */

/** What one request told us. `client`: the server answered, the request was refused (4xx, RLS, a raise): that's not an outage. */
export type RequestOutcome = 'ok' | 'timeout' | 'server' | 'network' | 'client'

export type ServerHealthStatus = 'ok' | 'degraded' | 'down'

/** Why it's down: the server (timeouts, gateway errors) or the device's own connection. */
export type ServerDownCause = 'server' | 'network'

export type ServerHealth = {
  status: ServerHealthStatus
  cause: ServerDownCause | null
  /** When the current run of failures started (ms), or null while ok. */
  since: number | null
  /** When the last failure happened (ms). */
  lastFailureAt: number | null
}

export const HEALTHY: ServerHealth = { status: 'ok', cause: null, since: null, lastFailureAt: null }

/** A second failure within this window after the first makes it `down`. */
export const DOWN_AFTER_SECOND_FAILURE_MS = 60_000

/** Reads (GET/HEAD and RPCs) give up after this; writes and token refreshes after WRITE_TIMEOUT_MS. */
export const READ_TIMEOUT_MS = 15_000
export const WRITE_TIMEOUT_MS = 20_000

/** Probe delays while down: 15 s, 30 s, 60 s, 2 min, then every 5 min. */
const PROBE_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000]

export function nextProbeDelay(attempt: number): number {
  return PROBE_DELAYS_MS[Math.min(Math.max(attempt, 0), PROBE_DELAYS_MS.length - 1)]
}

/** Gateway errors mean the server (or its database) isn't answering; other 5xx are a failed request. */
const GATEWAY_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524])

/**
 * Classify a finished request: `status` is the HTTP status, or null when fetch
 * threw. `timedOut` is true when our own time limit aborted it.
 */
export function classifyRequest({ status, timedOut = false }: { status: number | null; timedOut?: boolean }): RequestOutcome {
  if (timedOut) return 'timeout'
  if (status === null || status === 0) return 'network'
  if (GATEWAY_STATUSES.has(status)) return 'server'
  if (status >= 200 && status < 500) return status < 400 ? 'ok' : 'client'
  return 'client'
}

/** The next state after one request's outcome at `now`. Aborts by the caller and `client` outcomes don't change anything but prove the server answers. */
export function nextHealth(prev: ServerHealth, outcome: RequestOutcome, now: number): ServerHealth {
  if (outcome === 'ok' || outcome === 'client') return prev.status === 'ok' ? prev : HEALTHY
  const cause: ServerDownCause = outcome === 'network' ? 'network' : 'server'
  if (prev.status === 'ok') return { status: 'degraded', cause, since: now, lastFailureAt: now }
  if (prev.status === 'degraded') {
    const recent = prev.lastFailureAt !== null && now - prev.lastFailureAt <= DOWN_AFTER_SECOND_FAILURE_MS
    return recent
      ? { status: 'down', cause, since: prev.since ?? now, lastFailureAt: now }
      : { status: 'degraded', cause, since: now, lastFailureAt: now }
  }
  return { ...prev, cause, lastFailureAt: now }
}

/** The browser says it's offline: down at once, for the device's connection. */
export function offlineHealth(prev: ServerHealth, now: number): ServerHealth {
  return { status: 'down', cause: 'network', since: prev.since ?? now, lastFailureAt: now }
}

/** How long a request may take: no limit for Storage uploads, the write limit for writes and token refreshes, the read limit otherwise. */
export function requestTimeoutMs(url: string, method: string): number | null {
  const m = method.toUpperCase()
  if (/\/storage\/v1\/object/.test(url) && m !== 'GET' && m !== 'HEAD') return null
  if (/\/auth\/v1\/token/.test(url)) return WRITE_TIMEOUT_MS
  if (m === 'GET' || m === 'HEAD') return READ_TIMEOUT_MS
  // PostgREST RPCs are POSTs; a read-only one is still a read, but we can't tell, so give it the longer limit.
  return WRITE_TIMEOUT_MS
}
