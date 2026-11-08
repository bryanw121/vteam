import type { EventWithDetails, HiddenFeedEntry, HiddenFeedKind, HideFeedOption } from '../types'
import { SURFACE_LABELS } from '../constants/events'
import { profileDisplayName, surfaceOf } from './index'

/**
 * Hiding things from the Events feed (Settings → Hidden in feed). A player can
 * hide one item, every outside session at a venue, every event from a host, or
 * every event of a type (tag or surface). Entries live in
 * `user_settings.hidden_feed`; everything here is pure so the feed screen and
 * the settings list agree on what matches.
 */

/** Most entries a player keeps (the column's check constraint allows 500). */
export const HIDDEN_FEED_MAX = 400

const id = (kind: HiddenFeedKind, key: string) => `${kind}|${key}`

/** The keys an item would match, by kind. */
function keysFor(event: EventWithDetails): { kind: HiddenFeedKind; key: string }[] {
  const keys: { kind: HiddenFeedKind; key: string }[] = [{ kind: 'item', key: event.id }]
  if (event._external) {
    keys.push({ kind: 'venue', key: venueKey(event._external.venue) })
  } else if (event.created_by) {
    keys.push({ kind: 'host', key: event.created_by })
  }
  for (const tag of typeTags(event)) keys.push({ kind: 'type', key: `tag:${tag.toLowerCase()}` })
  const surface = surfaceOf(event)
  if (surface) keys.push({ kind: 'type', key: `surface:${surface}` })
  return keys
}

function venueKey(venue: string): string {
  return venue.trim().toLowerCase()
}

function typeTags(event: EventWithDetails): string[] {
  return (event.event_tags ?? [])
    .filter(et => et.tags?.category === 'event_type')
    .map(et => et.tags.name)
}

/** A set of `kind|key` for fast lookups while building the feed. */
export function hiddenIndex(entries: readonly HiddenFeedEntry[]): Set<string> {
  return new Set(entries.map(e => id(e.kind, e.key)))
}

/** True when any entry covers this item. */
export function isHidden(event: EventWithDetails, index: Set<string>): boolean {
  if (index.size === 0) return false
  return keysFor(event).some(k => index.has(id(k.kind, k.key)))
}

/** The entries that hide this item (Unhide on a revealed card removes them all). */
export function matchingEntries(event: EventWithDetails, entries: readonly HiddenFeedEntry[]): HiddenFeedEntry[] {
  const keys = new Set(keysFor(event).map(k => id(k.kind, k.key)))
  return entries.filter(e => keys.has(id(e.kind, e.key)))
}

/**
 * The choices in a card's hide menu, most specific first: this item, then its
 * venue (outside sessions) or host (vteam events, not your own), then its types.
 */
export function hideOptions(event: EventWithDetails, currentUserId: string | null | undefined): HideFeedOption[] {
  const options: HideFeedOption[] = []
  const external = event._external
  options.push({
    title: external ? 'Hide this session' : event._isTournament ? 'Hide this tournament' : 'Hide this event',
    entry: { kind: 'item', key: event.id, label: event.title, until: event.event_date },
  })
  if (external) {
    const venue = external.venue.trim()
    options.push({ title: `Hide everything at ${venue}`, entry: { kind: 'venue', key: venueKey(venue), label: venue } })
  } else if (event.created_by && event.created_by !== currentUserId) {
    const name = event.profiles ? profileDisplayName(event.profiles) : ''
    const label = name || 'This host'
    options.push({
      title: name ? `Hide events from ${name}` : 'Hide events from this host',
      entry: { kind: 'host', key: event.created_by, label },
    })
  }
  for (const tag of typeTags(event)) {
    options.push({ title: `Hide all ${tag}`, entry: { kind: 'type', key: `tag:${tag.toLowerCase()}`, label: tag } })
  }
  const surface = surfaceOf(event)
  if (surface) {
    const label = `${SURFACE_LABELS[surface]} games`
    options.push({ title: `Hide all ${label.toLowerCase()}`, entry: { kind: 'type', key: `surface:${surface}`, label } })
  }
  return options
}

/**
 * The list after hiding `entry`: no duplicate, item entries whose date has
 * passed dropped, newest first, and capped (the oldest go first).
 */
export function withHidden(entries: readonly HiddenFeedEntry[], entry: HiddenFeedEntry, nowMs = Date.now()): HiddenFeedEntry[] {
  const rest = pruneHidden(entries, nowMs).filter(e => id(e.kind, e.key) !== id(entry.kind, entry.key))
  return [entry, ...rest].slice(0, HIDDEN_FEED_MAX)
}

/** The list without the entry of this kind and key. */
export function withoutHidden(entries: readonly HiddenFeedEntry[], entry: Pick<HiddenFeedEntry, 'kind' | 'key'>): HiddenFeedEntry[] {
  return entries.filter(e => id(e.kind, e.key) !== id(entry.kind, entry.key))
}

/** Drops hidden items more than a day past their date: they can't show up again. */
export function pruneHidden(entries: readonly HiddenFeedEntry[], nowMs = Date.now()): HiddenFeedEntry[] {
  const cutoff = nowMs - 86_400_000
  return entries.filter(e => e.kind !== 'item' || !e.until || Date.parse(e.until) >= cutoff)
}

/** Reads `user_settings.hidden_feed`, ignoring anything malformed. */
export function parseHiddenFeed(raw: unknown): HiddenFeedEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(e => {
    if (!e || typeof e !== 'object') return []
    const { kind, key, label, until } = e as Record<string, unknown>
    if (kind !== 'item' && kind !== 'venue' && kind !== 'host' && kind !== 'type') return []
    if (typeof key !== 'string' || !key || typeof label !== 'string') return []
    return [{ kind, key, label, ...(typeof until === 'string' ? { until } : {}) }]
  })
}

/** Section titles for Settings → Hidden in feed, in display order. */
export const HIDDEN_FEED_GROUPS: { kind: HiddenFeedKind; title: string }[] = [
  { kind: 'type', title: 'Types' },
  { kind: 'venue', title: 'Venues' },
  { kind: 'host', title: 'Hosts' },
  { kind: 'item', title: 'Single events' },
]
