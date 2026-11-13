import type { EventWithDetails, ExternalSession, SearchClub, SearchFeedResult, SearchHost } from '../types'

/** Shortest and longest text `search_feed` accepts. */
export const SEARCH_MIN_CHARS = 2
export const SEARCH_MAX_CHARS = 60
/** Recent searches kept on the device. */
export const RECENT_SEARCHES_MAX = 8

/** The text as searched: trimmed, inner spaces collapsed, cut to the server's limit. */
export function normalizeSearchQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX_CHARS)
}

export function isSearchable(q: string): boolean {
  return normalizeSearchQuery(q).length >= SEARCH_MIN_CHARS
}

function arrayOf<T>(raw: unknown, ok: (v: unknown) => boolean): T[] {
  return Array.isArray(raw) ? (raw.filter(ok) as T[]) : []
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** `search_feed`'s jsonb, defensively: anything missing or odd reads as no results. */
export function parseSearchFeed(raw: unknown): SearchFeedResult {
  const o = isObj(raw) ? raw : {}
  return {
    events: arrayOf<string>(o.events, v => typeof v === 'string'),
    external: arrayOf<ExternalSession>(o.external, v => isObj(v) && typeof v.id === 'string' && typeof v.starts_at === 'string'),
    hosts: arrayOf<SearchHost>(o.hosts, v => isObj(v) && typeof v.id === 'string'),
    clubs: arrayOf<SearchClub>(o.clubs, v => isObj(v) && typeof v.id === 'string' && typeof v.name === 'string'),
  }
}

/** Event cards in the server's ranking order (a card that didn't load is left out). */
export function orderByIds(events: readonly EventWithDetails[], ids: readonly string[]): EventWithDetails[] {
  const byId = new Map(events.map(e => [e.id, e]))
  return ids.map(id => byId.get(id)).filter((e): e is EventWithDetails => !!e)
}

/** Put a search at the front of the recent list (case-insensitive dedupe, at most 8). */
export function addRecentSearch(list: readonly string[], q: string): string[] {
  const text = normalizeSearchQuery(q)
  if (text.length < SEARCH_MIN_CHARS) return [...list]
  return [text, ...list.filter(x => x.toLowerCase() !== text.toLowerCase())].slice(0, RECENT_SEARCHES_MAX)
}

/** The stored list, defensively. */
export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_SEARCHES_MAX) : []
  } catch {
    return []
  }
}

/** Total results shown, for the metric and the empty state. */
export function searchResultCount(r: { events: readonly unknown[]; external: readonly unknown[]; hosts: readonly unknown[]; clubs: readonly unknown[] }): number {
  return r.events.length + r.external.length + r.hosts.length + r.clubs.length
}
