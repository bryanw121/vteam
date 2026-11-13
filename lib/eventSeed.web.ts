import type { EventSeed } from '../types'

/** A seed older than this is ignored (the CDN keeps the page for up to ~15 minutes). */
export const EVENT_SEED_MAX_AGE_MS = 30 * 60_000

/** Pure: is `raw` a seed for event `id` that is young enough to show? */
export function usableEventSeed(raw: unknown, id: string, now = Date.now()): EventSeed | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<EventSeed>
  if (s.v !== 1 || s.id !== id || typeof s.at !== 'number' || !s.event) return null
  if (now - s.at > EVENT_SEED_MAX_AGE_MS || s.at - now > 60_000) return null
  return { v: 1, id, at: s.at, event: s.event, cohosts: Array.isArray(s.cohosts) ? s.cohosts : [], guests: Array.isArray(s.guests) ? s.guests : [] }
}

/**
 * The event `/event/<id>`'s HTML came with (`api/event-page.ts`, #244), read once and removed,
 * so a later visit in the same page never sees an old copy.
 */
export function takeEventSeed(id: string): EventSeed | null {
  if (typeof document === 'undefined') return null
  const el = document.getElementById('vteam-event-seed')
  if (!el) return null
  el.remove()
  try {
    return usableEventSeed(JSON.parse(el.textContent || 'null'), id)
  } catch {
    return null
  }
}
