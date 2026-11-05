import {
  COURTS_API_TIMEOUT_MS, COURTS_DAYS, SCHELAGG_API_BASE, SCHELAGG_SITE_BASE, SESSION_CHECK_TIMEOUT_MS,
} from '../constants/schelagg'
import { formatSessionTimeRange } from '../utils/feedItems'
import { AUSTIN_TZ, addDays, zonedToIso } from '../utils/courts'
import type { CourtsData, CourtsResponse, SessionCheckResult, SessionCheckStatus, SessionLinkDecision } from '../types'

/**
 * The only client for Schelagg's public endpoints (a separate project: vteam
 * never sends it credentials). Two reads:
 * - court availability: live `/api/courts`, falling back to the static
 *   `data/courts.json` the site publishes every ~15 minutes;
 * - the last-mile check on an outside session before its sign-up link opens.
 */

type FetchImpl = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

const defaultFetch: FetchImpl = (input, init) => fetch(input, init)

/** fetch with an AbortController deadline. Rejects on timeout. */
async function fetchWithTimeout(fetchImpl: FetchImpl, url: string, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } })
  } finally {
    clearTimeout(timer)
  }
}

/** Enough of the shape to draw the screen; anything else counts as a failed load. */
export function isCourtsResponse(value: unknown): value is CourtsResponse {
  const v = value as Partial<CourtsResponse> | null
  return !!v
    && typeof v.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.from)
    && typeof v.fetchedAt === 'string'
    && Array.isArray(v.venues)
    && v.venues.every(venue => !!venue && typeof venue.calendar === 'string' && Array.isArray(venue.facilities))
}

function normalize(body: CourtsResponse, source: CourtsData['source']): CourtsData {
  return {
    ...body,
    days: Number.isFinite(body.days) && body.days > 0 ? body.days : COURTS_DAYS,
    errors: Array.isArray(body.errors) ? body.errors : [],
    source,
  }
}

async function loadJson(fetchImpl: FetchImpl, url: string, timeoutMs: number): Promise<CourtsResponse> {
  const res = await fetchWithTimeout(fetchImpl, url, timeoutMs)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  if (!isCourtsResponse(body)) throw new Error('Unexpected court data')
  return body
}

/** Court availability for the next `days` days: the live API, else the static file. Throws if both fail. */
export async function fetchCourts(
  { days = COURTS_DAYS, fetchImpl = defaultFetch, timeoutMs = COURTS_API_TIMEOUT_MS }:
    { days?: number; fetchImpl?: FetchImpl; timeoutMs?: number } = {},
): Promise<CourtsData> {
  try {
    return normalize(await loadJson(fetchImpl, `${SCHELAGG_API_BASE}/api/courts?days=${days}`, timeoutMs), 'live')
  } catch {
    return normalize(await loadJson(fetchImpl, `${SCHELAGG_SITE_BASE}/data/courts.json`, timeoutMs), 'static')
  }
}

const STATUSES: readonly SessionCheckStatus[] = ['scheduled', 'canceled', 'changed', 'gone', 'unknown']

/**
 * Ask Schelagg whether an outside session is still on. Resolves to null for
 * anything other than a well-formed 200 (400 unknown id, 5xx, timeout, offline):
 * the caller then opens the link as if there were no check. Never rejects.
 */
export async function checkSession(
  sessionId: string,
  { fetchImpl = defaultFetch, timeoutMs = SESSION_CHECK_TIMEOUT_MS }: { fetchImpl?: FetchImpl; timeoutMs?: number } = {},
): Promise<SessionCheckResult | null> {
  if (!sessionId) return null
  try {
    const res = await fetchWithTimeout(fetchImpl, `${SCHELAGG_API_BASE}/api/check?session=${encodeURIComponent(sessionId)}`, timeoutMs)
    if (res.status !== 200) return null
    const body = await res.json() as Partial<SessionCheckResult> | null
    if (!body || !STATUSES.includes(body.status as SessionCheckStatus)) return null
    return body as SessionCheckResult
  } catch {
    return null
  }
}

const isHttpUrl = (url: unknown): url is string => typeof url === 'string' && /^https?:\/\//i.test(url)

/**
 * The new start/end of a changed session: the occurrence's instants when given,
 * else the session's local date + "HH:MM" in its time zone (Austin by default).
 */
function newTimes(result: SessionCheckResult): { startsAt: string | null; endsAt: string | null } {
  const occ = result.occurrence
  if (occ?.starts_at) return { startsAt: occ.starts_at, endsAt: occ.ends_at ?? null }
  const s = result.session
  if (!s?.date || !s.start) return { startsAt: null, endsAt: null }
  const tz = s.timezone || AUSTIN_TZ
  const startsAt = zonedToIso(s.date, s.start, tz)
  let endsAt = s.end ? zonedToIso(s.date, s.end, tz) : null
  // An end before the start runs past midnight.
  if (startsAt && endsAt && endsAt <= startsAt) endsAt = s.end ? zonedToIso(addDays(s.date, 1), s.end, tz) : null
  return { startsAt, endsAt }
}

/** Map a check result to what the card does: open the link now, or ask first. */
export function decideSessionLink(result: SessionCheckResult | null): SessionLinkDecision {
  if (!result) return { action: 'open' }
  if (result.status === 'canceled' || result.occurrence?.canceled === true || result.session?.canceled === true) {
    return { action: 'confirm', kind: 'canceled' }
  }
  if (result.status === 'gone') return { action: 'confirm', kind: 'gone' }
  if (result.status === 'changed') {
    const signupUrl = [result.occurrence?.signup_url, result.session?.signup?.url].find(isHttpUrl) ?? null
    return {
      action: 'confirm',
      kind: 'changed',
      ...newTimes(result),
      changes: Array.isArray(result.changes) ? result.changes.filter(c => typeof c === 'string') : [],
      signupUrl,
    }
  }
  return { action: 'open' }
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The new time of a changed session in the viewer's local time: "Sat, Oct 31 · 7–9pm". Null if unparseable. */
export function describeNewTime(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt) return null
  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return null
  const end = endsAt && !Number.isNaN(new Date(endsAt).getTime()) ? endsAt : null
  return `${DOW_SHORT[start.getDay()]}, ${MONTH_SHORT[start.getMonth()]} ${start.getDate()} · ${formatSessionTimeRange(startsAt, end)}`
}
