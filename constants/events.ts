import type { Surface } from '../types'
import { theme } from './theme'
// ─── Venues ───────────────────────────────────────────────────────────────────
// Add new locations here — the form picker reads from this array automatically.

export type VenueLocation = { id: string; label: string; address?: string }

export const LOCATIONS: VenueLocation[] = [
  { id: 'roots',       label: 'Roots',       address: '15407 Long Vista Dr Suite 100, Austin, TX 78728'          },
  { id: 'volleyworld', label: 'VolleyWorld',  address: '21419 Martin Ln Suite 240, Pflugerville, TX 78660'        },
  { id: 'crossover',  label: 'Crossover',   address: '1717 Scottsdale Dr, Leander, TX 78641'                    },
  { id: 'other',      label: 'Other'                                                                             },
]

// ─── Templates ────────────────────────────────────────────────────────────────
// Add new templates here — they appear as quick-fill chips in the create form.

export type EventTemplate = {
  id: string
  label: string
  title: string
  description: string
  locationId: string        // must match a LOCATIONS[*].id, or '' for none
  maxAttendees: number | null
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'open-play',
    label: 'Open Play',
    title: 'Open Play',
    description: 'Come join us for open play! All skill levels welcome.',
    locationId: 'roots',
    maxAttendees: 18,
  },
  {
    id: 'tournament',
    label: 'Tournament',
    title: 'Tournament',
    description: 'Competitive tournament. Teams will be assigned before play.',
    locationId: 'volleyworld',
    maxAttendees: null,
  },
  {
    id: 'practice',
    label: 'Practice',
    title: 'Team Practice',
    description: 'Focused skill-development session.',
    locationId: 'crossover',
    maxAttendees: 12,
  },
]

// ─── Duration ─────────────────────────────────────────────────────────────────

export const DEFAULT_DURATION_MINUTES = 120

export const DURATION_OPTIONS: { label: string; minutes: number }[] = [
  { label: '30 min', minutes: 30  },
  { label: '1h',     minutes: 60  },
  { label: '1.5h',   minutes: 90  },
  { label: '2h',     minutes: 120 },
  { label: '2.5h',   minutes: 150 },
  { label: '3h',     minutes: 180 },
  { label: '4h',     minutes: 240 },
]

// ─── Cheers ───────────────────────────────────────────────────────────────────

export const CHEERS_MAX_PER_EVENT = 5

export type CheerTypeConfig = {
  type: import('../types').CheerType
  label: string
  icon: string
}

export const CHEER_TYPES: CheerTypeConfig[] = [
  { type: 'spike',         label: 'Spiking',        icon: 'flash-outline'               },
  { type: 'block',         label: 'Blocking',        icon: 'shield-outline'              },
  { type: 'serve',         label: 'Serving',         icon: 'radio-outline'               },
  { type: 'dig',           label: 'Digging',         icon: 'arrow-down-circle-outline'   },
  { type: 'set',           label: 'Setting',         icon: 'git-merge-outline'           },
  { type: 'pass',          label: 'Passing',         icon: 'swap-horizontal-outline'     },
  { type: 'communication', label: 'Communication',   icon: 'chatbubbles-outline'         },
]

// ─── Recurrence ───────────────────────────────────────────────────────────────

export type RecurrenceCadence = 'weekly' | 'biweekly' | 'monthly'

export const DAY_LABELS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

/** Court surfaces, in display order. Values match events.surface and external_sessions.surface. */
export const SURFACE_OPTIONS: { id: Surface; label: string }[] = [
  { id: 'indoor', label: 'Indoor' },
  { id: 'sand',   label: 'Sand'   },
  { id: 'grass',  label: 'Grass'  },
]

export const SURFACE_LABELS: Record<Surface, string> = { indoor: 'Indoor', sand: 'Sand', grass: 'Grass' }

/** Accent per surface: outside-session cards and Book a court venues. */
export const SURFACE_ACCENTS: Record<Surface, string> = {
  indoor: theme.colors.primary,
  sand:   theme.colors.warm,
  grass:  theme.colors.cool,
}

// ─── Supabase list queries (EventCard / feeds) ─────────────────────────────────
/**
 * Core `events` columns for cards — omits `description` to shrink rows and JSON payload.
 * `requires_approval` is here so a card's RSVP button never instant-joins an
 * event whose host approves each request.
 */
export const EVENT_LIST_EVENT_COLUMNS =
  'id, created_by, club_id, title, location, event_date, duration_minutes, max_attendees, created_at, price, requires_approval, surface'

/**
 * Main Events tab + club upcoming: host, RSVP count, tags, club badge.
 * Attendee avatars are hydrated separately via `get_event_card_attendee_previews`
 * (capped at 3) — do not embed unbounded `event_attendees_attending → profiles` here.
 * Optional `my_attendance` embed (viewer RSVP) is appended by list hooks when the user id is known.
 */
export const EVENT_CARD_LIST_SELECT = `${EVENT_LIST_EVENT_COLUMNS}, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees_attending(count), event_guests_attending(count), event_attendees_waitlisted(count), event_tags (tag_id, tags (id, name, category, display_order)), clubs (id, name, avatar_url)`

/**
 * Appended to list selects when signed in — embed filtered to the current user,
 * so it returns at most one row per event.
 *
 * Embeds the base `event_attendees` table rather than the attending-only view so
 * the row carries `status`: the "You're going" rail has to tell attending from
 * waitlisted from pending-approval, and the view drops the latter two entirely.
 * RLS is unchanged — `event_attendees_attending` is `security_invoker`, so it
 * already reads the base table as the calling user.
 *
 * Anything reading this must check `status`, not mere presence — see
 * `EVENT_CARD_MY_ATTENDANCE_SELECT_ATTENDING_ONLY` for the fallback shape.
 */
export const EVENT_CARD_MY_ATTENDANCE_SELECT =
  'my_attendance:event_attendees(user_id, status)'

/**
 * Previous shape, kept as a runtime fallback. The migration files in
 * `supabase/migrations/` are known to lag the live schema, so if the widened
 * embed above is ever rejected by PostgREST the feed retries with this one and
 * degrades to attending-only rather than rendering an empty screen.
 */
export const EVENT_CARD_MY_ATTENDANCE_SELECT_ATTENDING_ONLY =
  'my_attendance:event_attendees_attending(user_id)'

/** Columns the Events feed reads from `external_sessions` (Schelagg data). */
export const EXTERNAL_SESSION_SELECT =
  'id, source_id, region, title, venue, city, surface, session_type, level, price, starts_at, ends_at, signup_url, signup_label, note, verified_at'

/**
 * Hide external sessions the hourly Schelagg feed ingest hasn't refreshed for this long.
 * Each ingest rewrites every upcoming row's `updated_at` and deletes sessions the
 * venue cancelled, so rows older than this mean ingestion has stopped: show no
 * outside sessions rather than possibly-cancelled ones. Comfortably longer than
 * the hourly ingest interval.
 */
export const EXTERNAL_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

/** Hosted / history settings lists: host + RSVP count only (no tag/club embeds). */
export const EVENT_CARD_LIST_SELECT_MINIMAL = `${EVENT_LIST_EVENT_COLUMNS}, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees_attending(count), event_guests_attending(count), event_attendees_waitlisted(count)`

// ─── Team colors (event People & Cheers tabs) ──────────────────────────────────
export const TEAM_COLORS      = ['#6C47FF', '#E85D5D', '#2DA265', '#E07B00', '#1A8FD1', '#9C27B0']
export const TEAM_COLOR_NAMES = ['Purple',  'Red',     'Green',   'Orange',  'Blue',    'Violet']
