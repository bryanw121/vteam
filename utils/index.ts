import type { Profile, VolleyballPosition, VolleyballSkillLevel, EventAttendee, EventAttendeeCountEmbed, GooglePlacePrediction, Surface } from '../types'
import { AVATARS_BUCKET, CLUB_AVATARS_BUCKET } from '../constants/storage'
import { SKILL_LEVEL_LABELS } from '../constants/copy'

export { confirmDestructive } from './confirm'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!

export function formatEventDate(dateString: string, style: 'short' | 'long' = 'short') {
  // Supabase `timestamp without time zone` returns strings with no timezone suffix
  // (e.g. "2024-03-28T20:00:00"). JS treats those as local time, not UTC, which
  // shifts the displayed time by the user's UTC offset. Appending 'Z' forces UTC.
  const normalized = /[Z+]/.test(dateString) ? dateString : dateString + 'Z'
  const date = new Date(normalized)
  const options: Intl.DateTimeFormatOptions = {
    weekday: style === 'long' ? 'long' : 'short',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
  return date.toLocaleString('en-US', options)
}

/**
 * Short "Mar 28, 8:00 PM" stamp for comment/discussion rows. Normalizes the
 * missing-timezone Supabase string to UTC (see `formatEventDate`) so the time
 * doesn't shift by the viewer's offset.
 */
export function formatCommentTime(iso: string): string {
  const normalized = /[Z+]/.test(iso) ? iso : iso + 'Z'
  return new Date(normalized).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Human duration label, e.g. "45 min" or "2h". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = minutes / 60
  return `${h}h`
}

// ─── Member display names ─────────────────────────────────────────────────────

type NameParts = Pick<Profile, 'username' | 'first_name' | 'last_name'>

/**
 * How a member's real name renders across shared surfaces (event rosters,
 * comments, chat, clubs, tournaments).
 *
 *   'full'        → "Jordan Rivera"
 *   'abbreviated' → "Jordan R."
 *
 * Deliberately a single switch: the last-name-visibility call is a product /
 * privacy decision, so flipping it back is a one-line change here rather than
 * an edit across every call site.
 */
export const DISPLAY_NAME_FORMAT: 'full' | 'abbreviated' = 'full'

/** Trimmed value, or null when absent/blank — DB holds null *and* empty strings. */
function cleanNamePart(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * The name shown for a member anywhere other than their own profile header.
 *
 * Falls back progressively: both names → whichever single name is set →
 * username. Members who filled in only a first name previously fell all the
 * way through to their username, which is why real names appeared to be
 * "profile-only" on the events page.
 */
export function profileDisplayName(profile: NameParts): string {
  const first = cleanNamePart(profile.first_name)
  const last = cleanNamePart(profile.last_name)

  if (first && last) {
    return DISPLAY_NAME_FORMAT === 'full' ? `${first} ${last}` : `${first} ${last.charAt(0)}.`
  }
  return first ?? last ?? cleanNamePart(profile.username) ?? 'Member'
}

/**
 * The name for a profile *header* (own profile, another member's profile).
 *
 * Always the full real name — a profile page is where someone expects to see
 * it in full, so this deliberately ignores `DISPLAY_NAME_FORMAT`. Flipping
 * that switch back to 'abbreviated' must not turn a profile header into
 * "Jordan R.".
 */
export function profileFullName(profile: NameParts): string {
  const first = cleanNamePart(profile.first_name)
  const last = cleanNamePart(profile.last_name)
  const joined = [first, last].filter(Boolean).join(' ')
  return joined || cleanNamePart(profile.username) || 'Member'
}

/** Avatar-placeholder initials. Mirrors `profileDisplayName`'s fallback order. */
export function profileInitial(profile: NameParts): string {
  const first = cleanNamePart(profile.first_name)
  const last = cleanNamePart(profile.last_name)

  if (first && last) return first.charAt(0).toUpperCase() + last.charAt(0).toUpperCase()
  const single = first ?? last ?? cleanNamePart(profile.username)
  return single ? single.charAt(0).toUpperCase() : '?'
}

// ─── Member search ────────────────────────────────────────────────────────────

/** Columns searched by the "find a member" boxes (chat, event invite, tournament invite). */
const MEMBER_SEARCH_COLUMNS = ['username', 'first_name', 'last_name'] as const

/**
 * Escapes one user-typed term for use as a PostgREST `ilike` value.
 *
 * Two separate hazards, both reachable by typing an ordinary name:
 *  1. PostgREST parses `or=(...)` as a comma-separated logic tree, so a raw
 *     `,` `.` `(` `)` in the term corrupts the tree — a comma 400s the request
 *     outright, a `)` silently truncates the filter and returns wrong rows.
 *     Wrapping the value in double quotes makes PostgREST treat it as a
 *     literal (verified against the live API).
 *  2. `%` and `_` are SQL LIKE wildcards and `*` is PostgREST's alias for `%`,
 *     so leaving them in lets a term match far more than the user typed.
 *     They're dropped, making search plain substring matching.
 */
export function escapeMemberSearchTerm(term: string): string {
  return term
    .trim()
    .replace(/[\\"]/g, '\\$&')  // backslash + double quote — quoting's own escapes
    .replace(/[%_*]/g, '')      // LIKE / PostgREST wildcards
}

/**
 * Builds the `.or(...)` filter for a member search, or null when the term has
 * no searchable characters left (caller should skip the query and show nothing
 * rather than fetching every profile).
 */
export function buildMemberSearchFilter(rawTerm: string): string | null {
  const escaped = escapeMemberSearchTerm(rawTerm)
  if (!escaped) return null
  return MEMBER_SEARCH_COLUMNS.map(col => `${col}.ilike."%${escaped}%"`).join(',')
}

export { sanitizePriceInput, parsePrice, normalizePriceText, formatPrice, formatPriceAmount } from './price'

export function cleanDate(d: Date) {
  const clean = new Date(d)
  clean.setSeconds(0, 0)
  return clean.toISOString()
}

export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

import { parseEventDate } from './eventDate'

export { parseEventDate }

/**
 * "YYYY-MM-DD" in the *viewer's* timezone — the app's single calendar-key format.
 *
 * Every calendar surface (week strip, month grid, event dots, feed date
 * sections, scroll-to-date anchors) must key off this. Slicing the raw ISO
 * string instead yields the UTC date, which is a different day for any event
 * after 7pm in US Central — that mismatch put event dots on the wrong day.
 */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Calendar key for an event, in the viewer's timezone. */
export function eventLocalDateKey(iso: string): string {
  return localDateKey(parseEventDate(iso))
}

type EventAttendeesRelation = readonly (EventAttendee | EventAttendeeCountEmbed)[] | null | undefined

function isEventAttendeeCountEmbedRow(row: EventAttendee | EventAttendeeCountEmbed): row is EventAttendeeCountEmbed {
  return 'count' in row && !('user_id' in row)
}

/** Full attendee rows when the query embedded row data; empty when the relation is `event_attendees(count)` only. */
export function eventAttendeeRows(event: { event_attendees?: EventAttendeesRelation }): EventAttendee[] {
  const ea = event.event_attendees
  if (!ea || ea.length === 0) return []
  if (isEventAttendeeCountEmbedRow(ea[0])) return []
  return ea as EventAttendee[]
}

function listHeadcountFromEmbed(
  attending: readonly EventAttendeeCountEmbed[] | undefined,
  guests: readonly EventAttendeeCountEmbed[] | undefined,
): number | null {
  if (!attending || attending.length === 0 || !isEventAttendeeCountEmbedRow(attending[0])) return null
  const a = Math.max(0, Number(attending[0].count))
  const g =
    guests && guests.length > 0 && isEventAttendeeCountEmbedRow(guests[0]) ? Math.max(0, Number(guests[0].count)) : 0
  return a + g
}

/**
 * Count for EventCard / capacity: list queries use attending-only embeds (+1 guests included);
 * full `event_attendees` rows count non-waitlisted attendees only (guests are not on that relation).
 */
export function eventAttendeeDisplayCount(event: {
  event_attendees?: EventAttendeesRelation
  event_attendees_attending?: readonly EventAttendeeCountEmbed[]
  event_guests_attending?: readonly EventAttendeeCountEmbed[]
}): number {
  const fromList = listHeadcountFromEmbed(event.event_attendees_attending, event.event_guests_attending)
  if (fromList !== null) return fromList
  const ea = event.event_attendees
  if (!ea || ea.length === 0) return 0
  if (isEventAttendeeCountEmbedRow(ea[0])) return Math.max(0, Number(ea[0].count))
  return (ea as EventAttendee[]).filter(a => a.status !== 'waitlisted').length
}

const VOLLEYBALL_POSITION_ALLOWED = new Set<string>([
  'setter',
  'libero',
  'outside_hitter',
  'defensive_specialist',
  'opposite_hitter',
])

/** Normalizes DB `position` (text[], null, or legacy single text) to a deduped list. */
export function normalizeVolleyballPositions(raw: unknown): VolleyballPosition[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    const out: VolleyballPosition[] = []
    const seen = new Set<string>()
    for (const x of raw) {
      if (typeof x !== 'string' || !VOLLEYBALL_POSITION_ALLOWED.has(x) || seen.has(x)) continue
      seen.add(x)
      out.push(x as VolleyballPosition)
    }
    return out
  }
  if (typeof raw === 'string' && VOLLEYBALL_POSITION_ALLOWED.has(raw))
    return [raw as VolleyballPosition]
  return []
}

export function volleyballPositionsEqualUnordered(a: VolleyballPosition[], b: VolleyballPosition[]): boolean {
  if (a.length !== b.length) return false
  const sb = [...b].sort()
  return [...a].sort().every((v, i) => v === sb[i])
}

/** Short labels for host roster / team-balance UI (order follows `profiles.position`). */
const VOLLEYBALL_POSITION_ABBREV: Record<VolleyballPosition, string> = {
  setter: 'S',
  libero: 'L',
  outside_hitter: 'OH',
  middle_blocker: 'MB',
  defensive_specialist: 'DS',
  opposite_hitter: 'RH',
}

/** Comma-separated abbreviations (e.g. `S, OH, MB`). Empty array → empty string. */
export function volleyballPositionsAbbreviated(positions: VolleyballPosition[]): string {
  if (!positions.length) return ''
  return positions.map(p => VOLLEYBALL_POSITION_ABBREV[p]).join(', ')
}

/**
 * One line for hosts: skill tier and/or preferred positions (abbrev.), middle dot separator.
 * Uses "Skill not set" when tier missing; omits position segment when none listed.
 */
export function hostRosterSkillAndPositionsLine(profile: Pick<Profile, 'skill_level' | 'position'>): string {
  const skillPart = profile.skill_level ? volleyballSkillLevelLabel(profile.skill_level) : 'Skill not set'
  const posPart = volleyballPositionsAbbreviated(profile.position ?? [])
  return posPart ? `${skillPart} · ${posPart}` : skillPart
}

const VOLLEYBALL_SKILL_LEVEL_ALLOWED = new Set<string>([
  'd', 'c', 'b', 'bb', 'a', 'aa_plus',
])

/** Normalizes DB `skill_level` to a known tier or null. */
export function normalizeVolleyballSkillLevel(raw: unknown): VolleyballSkillLevel | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'string' && VOLLEYBALL_SKILL_LEVEL_ALLOWED.has(raw)) return raw as VolleyballSkillLevel
  return null
}

export function volleyballSkillLevelLabel(level: VolleyballSkillLevel): string {
  return SKILL_LEVEL_LABELS[level] ?? level
}

/** `profiles.avatar_url` may hold a legacy full HTTP URL or a storage object path. */
export function profileAvatarFieldIsHttpUrl(ref: string | null | undefined): boolean {
  if (ref == null || ref === '') return false
  return /^https?:\/\//i.test(ref.trim())
}

// ─── Avatar URL helpers (avatars bucket is public) ────────────────────────────

/** Full-resolution public URL for a storage path in the avatars bucket. Synchronous — no network call. */
function avatarPublicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`
}

/**
 * Supabase image transformations (`/render/image`) need a paid plan; on this
 * project they answer 403, which left every small avatar blank. Until they are
 * enabled, small avatars use the original public object. Flip this to true after
 * upgrading to get resized thumbnails back.
 */
const IMAGE_TRANSFORMS_ENABLED = false

/** Small (default 80×80) avatar URL for lists and cards. */
function avatarSmallUrl(path: string, size = 80): string {
  if (!IMAGE_TRANSFORMS_ENABLED) return avatarPublicUrl(path)
  return `${SUPABASE_URL}/storage/v1/render/image/public/${AVATARS_BUCKET}/${path}?width=${size}&height=${size}&quality=70&resize=cover`
}

/**
 * Synchronous small-avatar URI for `<Image>` — public bucket, no network call.
 * Legacy full HTTP URLs pass through; storage paths become a `size`×`size` render URL
 * (or the original image while IMAGE_TRANSFORMS_ENABLED is false).
 * Returns null for empty refs. Use this in list/message rows that resolve inline.
 */
export function profileAvatarSmallUri(ref: string | null | undefined, size = 80): string | null {
  if (ref == null || ref === '') return null
  const trimmed = ref.trim()
  if (profileAvatarFieldIsHttpUrl(trimmed)) return trimmed
  return avatarSmallUrl(trimmed, size)
}

/** Resolves `avatar_url` to an `Image` URI. Public bucket — returns immediately. */
export async function resolveProfileAvatarUri(ref: string | null | undefined): Promise<string | null> {
  const r = await resolveProfileAvatarUriWithError(ref)
  return r.uri
}

export async function resolveProfileAvatarUriWithError(
  ref: string | null | undefined,
): Promise<{ uri: string | null; error: string | null }> {
  if (ref == null || ref === '') return { uri: null, error: null }
  const trimmed = ref.trim()
  if (profileAvatarFieldIsHttpUrl(trimmed)) return { uri: trimmed, error: null }
  return { uri: avatarPublicUrl(trimmed), error: null }
}

/** Resolves `avatar_url` to a compressed 80×80 URI — use for small avatars in lists and cards. */
export async function resolveProfileAvatarUriSmall(
  ref: string | null | undefined,
): Promise<{ uri: string | null; error: string | null }> {
  if (ref == null || ref === '') return { uri: null, error: null }
  const trimmed = ref.trim()
  if (profileAvatarFieldIsHttpUrl(trimmed)) return { uri: trimmed, error: null }
  return { uri: avatarSmallUrl(trimmed), error: null }
}

// ─── Club avatar/cover — public bucket ───────────────────────────────────────

/** Resolves a club `avatar_url` or `cover_url` storage path to a public URL. */
export function resolveClubAvatarUri(ref: string | null | undefined): Promise<string | null> {
  if (ref == null || ref === '') return Promise.resolve(null)
  const trimmed = ref.trim()
  if (/^https?:\/\//i.test(trimmed)) return Promise.resolve(trimmed)
  return Promise.resolve(`${SUPABASE_URL}/storage/v1/object/public/${CLUB_AVATARS_BUCKET}/${trimmed}`)
}

/**
 * Applies an exact received-cheers count without erasing a known value when a
 * refresh request fails. A successful head-only count can legitimately be
 * null, which represents zero rows.
 */
export function resolveReceivedCheersCount(
  result: { count: number | null; error: unknown | null },
  previousCount: number,
): number {
  if (result.error) return previousCount
  return result.count ?? 0
}

/**
 * What has to change to turn `original` into `selected`.
 *
 * Event tags used to be saved by deleting every row for the event and
 * re-inserting the whole set. Two un-transacted round-trips: if the insert
 * failed, the event was left with **zero** tags and vanished from every feed
 * filter except "All" — a failure a host would never connect back to the title
 * edit they just made.
 *
 * A diff is failure-safe by construction rather than by transaction: a partial
 * failure leaves some valid subset of tags, never an empty set. It also makes
 * the common case (editing a title, tags untouched) write nothing at all.
 *
 * Duplicates and ordering in either input are irrelevant — both sides are
 * treated as sets.
 */
export function diffTagIds(
  original: readonly string[],
  selected: readonly string[],
): { toAdd: string[]; toRemove: string[] } {
  const originalSet = new Set(original)
  const selectedSet = new Set(selected)
  return {
    toAdd:    [...selectedSet].filter(id => !originalSet.has(id)),
    toRemove: [...originalSet].filter(id => !selectedSet.has(id)),
  }
}

// ─── Venue display name ───────────────────────────────────────────────────────

/**
 * How a selected Places prediction becomes the single `events.location` string.
 *
 * There is one column for the venue, so an address-type result has to carry its
 * own locality or it saves as a bare, ambiguous street line ("1100 Congress Ave").
 * A named establishment already reads unambiguously, so it keeps `main_text`
 * alone — which is exactly what live events store today, so no existing venue
 * changes appearance.
 *
 * This is the single switch for that decision: set it to 'main-text-only' to
 * restore the previous behaviour for every result type. (Distinct from
 * DISPLAY_NAME_FORMAT above, which governs member names.)
 */
export const VENUE_DISPLAY_FORMAT: 'main-text-only' | 'address-gets-locality' = 'address-gets-locality'

/**
 * Google marks named places with one of these; anything else is treated as an
 * address.
 *
 * `premise` is deliberately NOT here. It reads like "a named building", but
 * Google returns `['geocode', 'premise']` for ordinary street addresses — a
 * live call for "1100 Congress Ave" comes back exactly that way. Treating
 * `premise` as an establishment therefore suppressed the locality on the most
 * common address shape of all, which is the whole case this function exists
 * for. Verified against the deployed proxy, not assumed.
 */
const ESTABLISHMENT_TYPES = ['establishment', 'point_of_interest']

/**
 * Build the venue string stored on the event.
 *
 * Only ever appends the locality (the first segment of `secondary_text`, i.e.
 * the city — not the state or country, which would bloat every event card).
 * Skips the append when `main_text` already ends with that locality, so
 * "Austin Sports Center, Austin, TX" never becomes "… Austin, Austin".
 */
export function formatVenueDisplay(prediction: GooglePlacePrediction): string {
  const main = prediction.structured_formatting.main_text?.trim() ?? ''
  if (VENUE_DISPLAY_FORMAT === 'main-text-only') return main

  const isEstablishment = (prediction.types ?? []).some(t => ESTABLISHMENT_TYPES.includes(t))
  if (isEstablishment || !main) return main

  const locality = (prediction.structured_formatting.secondary_text ?? '')
    .split(',')[0]
    .trim()
  if (!locality) return main
  if (main.toLowerCase().endsWith(locality.toLowerCase())) return main
  return `${main}, ${locality}`
}

/** Narrow a DB string to a court surface (`events.surface`, `external_sessions.surface`). */
export function isSurface(value: unknown): value is Surface {
  return value === 'indoor' || value === 'sand' || value === 'grass'
}

/** A feed item's surface: the host's choice for club events, the venue's for outside sessions. */
export function surfaceOf(event: { surface?: string | null; _external?: { surface?: string | null } | null }): Surface | null {
  const s = event._external ? event._external.surface : event.surface
  return isSurface(s) ? s : null
}
