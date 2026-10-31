/**
 * Shared by the link-preview functions (#130): `api/event-page.ts` (Node) and
 * `api/og/event.tsx` (Edge). Only `fetch` and import-free app modules, so it
 * runs in both runtimes. Files under `api/_lib` are not deployed as functions.
 *
 * Reads go to PostgREST with the public anon key, so RLS decides what a
 * preview can show: exactly what a guest sees on the event page.
 */
import { EVENT_PREVIEW_COLUMNS } from '../../constants/selects'
import type { EventPreviewRow } from '../../types'

export const EVENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** CDN cache for a preview: 5 min fresh, then served stale for 10 more while it refreshes. */
export const PREVIEW_CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
/** When Supabase could not be read: cache the generic preview only briefly. */
export const PREVIEW_ERROR_CACHE_CONTROL = 'public, max-age=0, s-maxage=30'

/** Abort a PostgREST read after this long; a crawler won't wait much longer for the page. */
const FETCH_TIMEOUT_MS = 3000

type Env = Record<string, string | undefined>

export type SupabaseRestConfig = { url: string; anonKey: string }

export type EventPreviewData = { event: EventPreviewRow | null; attending: number }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * `SUPABASE_URL` / `SUPABASE_ANON_KEY` (server-side copies of the public values),
 * else the `EXPO_PUBLIC_*` ones the web build already uses. Null when neither is set.
 */
export function supabaseRestConfig(env: Env): SupabaseRestConfig | null {
  const url = (env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  const anonKey = env.SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
  return url && anonKey ? { url, anonKey } : null
}

/** Total from a PostgREST `Content-Range` header ("0-4/5" or "*\/0"). */
export function parseContentRangeTotal(header: string | null): number {
  const total = Number(header?.split('/')[1])
  return Number.isFinite(total) && total > 0 ? total : 0
}

/**
 * The event's guest-visible fields and its headcount (attendees + their +1
 * guests, as the event card counts it). `event` is null for an unknown id or
 * one anon can't see. Throws on a network error or a PostgREST error status,
 * so the caller can serve the generic preview with a short cache.
 */
export async function fetchEventPreview(id: string, cfg: SupabaseRestConfig, fetchImpl: FetchLike = fetch): Promise<EventPreviewData> {
  const headers = { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, Accept: 'application/json' }
  const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined
  const rest = (path: string, init: RequestInit = {}) =>
    fetchImpl(`${cfg.url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, signal })
  const count = (view: string) =>
    rest(`${view}?select=event_id&event_id=eq.${id}`, { method: 'HEAD', headers: { Prefer: 'count=exact' } })

  const [eventRes, attendingRes, guestsRes] = await Promise.all([
    rest(`events?select=${EVENT_PREVIEW_COLUMNS}&id=eq.${id}&limit=1`),
    count('event_attendees_attending'),
    count('event_guests_attending'),
  ])
  for (const res of [eventRes, attendingRes, guestsRes]) {
    if (!res.ok) throw new Error(`PostgREST ${res.status} for ${res.url || 'event preview'}`)
  }
  const rows = (await eventRes.json()) as EventPreviewRow[]
  const event = Array.isArray(rows) && rows[0] ? rows[0] : null
  const attending = parseContentRangeTotal(attendingRes.headers.get('content-range'))
    + parseContentRangeTotal(guestsRes.headers.get('content-range'))
  return { event, attending: event ? attending : 0 }
}

/**
 * `https://host` of the request: Vercel sets `x-forwarded-host` / `-proto`.
 * Falls back to `fallback` when the host header is missing or malformed.
 */
export function requestOrigin(get: (name: string) => string | null | undefined, fallback: string): string {
  const first = (v: string | null | undefined) => (v ?? '').split(',')[0].trim()
  const host = first(get('x-forwarded-host')) || first(get('host'))
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return fallback
  const proto = first(get('x-forwarded-proto')) === 'http' ? 'http' : 'https'
  return `${proto}://${host}`
}

/** Short stable hash (djb2, base 36): versions the og:image URL so a changed card is refetched. */
export function shortHash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
