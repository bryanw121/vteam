import type { FeedSpanRows } from '../types'

/**
 * Client half of `get_feed_span` (supabase/migrations/20261025220000_get_feed_span.sql):
 * the Events feed for a date range in one request instead of three queries plus
 * a preview round trip. hooks/feed/fetch calls it and falls back to the
 * three-query path when it is unavailable.
 */

/**
 * Errors meaning the function isn't there (not deployed yet, schema cache not
 * reloaded) or can't run against this schema (e.g. a column it reads is
 * missing). Retrying won't help within this session, so the feed stops asking.
 * Anything else (network, timeout, expired JWT) falls back for that fetch only.
 */
const RPC_UNAVAILABLE_CODES = new Set([
  'PGRST202', // function not found in the schema cache
  'PGRST203', // ambiguous overload
  '42883',    // undefined_function
  '42703',    // undefined_column
  '42P01',    // undefined_table
  '42501',    // insufficient_privilege (EXECUTE not granted)
])

export function isFeedRpcUnavailable(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && RPC_UNAVAILABLE_CODES.has(error.code)
}

/** The RPC's jsonb, checked: null if it isn't the object the client expects (the caller then falls back). */
export function parseFeedSpan(data: unknown): FeedSpanRows | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  if (!Array.isArray(d.events)) return null
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    events: d.events as FeedSpanRows['events'],
    tournaments: list(d.tournaments),
    external: list(d.external) as FeedSpanRows['external'],
    previews: list(d.previews) as FeedSpanRows['previews'],
  }
}
