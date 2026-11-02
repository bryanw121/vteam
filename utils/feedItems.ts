import type { EventWithDetails, ExternalSession, Tag } from '../types'
import { parseEventDate } from './eventDate'

/**
 * The Events feed renders one list of `EventWithDetails`. Tournaments and
 * sessions from other Austin venues are normalized into that shape so date
 * grouping, calendar dots and filters work on all three without branching;
 * the `_isTournament` / `_external` flag tells cards how to render and link.
 */

function typeTag(name: string, order: number): { tag_id: string; tags: Tag } {
  const id = `_${name.toLowerCase().replace(/\s+/g, '_')}`
  return { tag_id: id, tags: { id, name, category: 'event_type', display_order: order, created_at: '' } as Tag }
}

const TOURNAMENT_TAG = typeTag('Tournament', 2)

const EMPTY_COUNTS = {
  attendee_previews: [],
  my_attendance: [],
  event_attendees_attending: [{ count: 0 }],
  event_guests_attending: [{ count: 0 }],
  event_attendees_waitlisted: [{ count: 0 }],
}

export function normalizeTournaments(rows: unknown[] | null): EventWithDetails[] {
  return (rows ?? []).map((t: any) => ({
    id:               t.id,
    created_by:       t.created_by,
    club_id:          t.club_id,
    title:            t.title,
    description:      null,
    location:         t.location,
    event_date:       t.start_date,
    duration_minutes: 0,
    max_attendees:    t.max_teams ?? null,
    created_at:       t.created_at,
    price:            t.price ?? 0,
    cancelled_at:     null,
    profiles:         t.profiles,
    clubs:            t.clubs,
    event_tags:       [TOURNAMENT_TAG],
    ...EMPTY_COUNTS,
    _isTournament:    true,
  }))
}

/** "Open play" → an "Open Play" type tag, so the Open Play filter chip includes it. */
function externalTypeTag(sessionType: string | null) {
  if (!sessionType) return []
  const name = sessionType.replace(/\b\w/g, c => c.toUpperCase())
  return [typeTag(name, 1)]
}

export function normalizeExternalSessions(rows: ExternalSession[] | null): EventWithDetails[] {
  return (rows ?? []).map(s => ({
    id:               `external:${s.id}`,
    created_by:       '',
    club_id:          null,
    title:            s.title,
    description:      s.note,
    location:         s.city ? `${s.venue} · ${s.city}` : s.venue,
    event_date:       s.starts_at,
    duration_minutes: s.ends_at ? Math.round((Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000) : 0,
    max_attendees:    null,
    created_at:       s.starts_at,
    price:            null,
    cancelled_at:     null,
    // No vteam host: cards for these never read the profile.
    profiles:         null as unknown as EventWithDetails['profiles'],
    clubs:            null,
    event_tags:       externalTypeTag(s.session_type),
    ...EMPTY_COUNTS,
    _external:        s,
  }))
}

function clock(d: Date, withMeridiem: boolean): string {
  const h = d.getHours() % 12 || 12
  const m = d.getMinutes()
  const base = m ? `${h}:${String(m).padStart(2, '0')}` : `${h}`
  return withMeridiem ? `${base}${d.getHours() < 12 ? 'am' : 'pm'}` : base
}

/** "7:30–9pm", "11am–1pm", or "7pm" without an end. Local time. */
export function formatSessionTimeRange(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt)
  if (!endsAt) return clock(start, true)
  const end = new Date(endsAt)
  const sameMeridiem = (start.getHours() < 12) === (end.getHours() < 12)
  return `${clock(start, !sameMeridiem)}–${clock(end, true)}`
}

/** Hostname for the "Sign up on …" fallback label: "reclub.co". */
export function signupHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'their site'
  }
}

/**
 * Whether a feed item has finished by `nowMs`, so the feed can drop it.
 * Its end is `event_date + duration_minutes`. Items without a duration (tournaments, outside
 * sessions with no posted end) have no known end: they stay for the rest of their day.
 */
export function isFeedItemOver(event: Pick<EventWithDetails, 'event_date' | 'duration_minutes'>, nowMs: number): boolean {
  if (!event.duration_minutes || event.duration_minutes <= 0) return false
  return parseEventDate(event.event_date).getTime() + event.duration_minutes * 60_000 <= nowMs
}
