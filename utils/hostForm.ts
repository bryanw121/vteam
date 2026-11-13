/**
 * The host form's pure core (#188 part 1): the empty and prefilled form, the
 * form from an event being edited, the dates a save creates, and the `events`
 * columns a save writes. Moved out of `app/(app)/host.tsx` so it is tested
 * without the screen, and so a save RPC (part 4) and club poll prefill use the
 * same rules.
 */
import { DEFAULT_DURATION_MINUTES } from '../constants'
import { isSurface, parsePrice } from './index'
import { parsePrefillDate } from './clubPoll'
import { generateEventDates } from './recurrence'
import type { CreateEventForm, EventEditSource, HostFormParams, HostRecurrence, LocationValue, TablesInsert, UserEventTemplate } from '../types'

/** Now, rounded up to the next 5 minutes: the default start of a new game. */
export function roundToNearest5(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5)
  return d
}

export function emptyForm(now: Date = new Date()): CreateEventForm {
  return {
    title: '',
    description: '',
    location: '',
    locationLatitude: null,
    locationLongitude: null,
    date: roundToNearest5(now),
    durationMinutes: DEFAULT_DURATION_MINUTES,
    maxAttendees: null,
    priceText: '',
    venmoHandle: '',
    requiresApproval: false,
    surface: null,
  }
}

/**
 * A new event's form with what a link passed in: Book a court ("Already booked?
 * Create a vteam event for it") sends the venue, its surface and a cap; a club
 * poll's winning time (#175) sends the start and the question as the title.
 * Anything malformed is ignored.
 */
export function formFromParams(base: CreateEventForm, params: HostFormParams, nowMs: number = Date.now()): CreateEventForm {
  const cap = parseInt(params.maxAttendees ?? '', 10)
  const date = parsePrefillDate(params.date, nowMs)
  const title = typeof params.title === 'string' ? params.title.trim() : ''
  return {
    ...base,
    maxAttendees: Number.isFinite(cap) && cap > 0 ? cap : null,
    location: typeof params.location === 'string' ? params.location.slice(0, 200) : '',
    surface: isSurface(params.surface) ? params.surface : null,
    ...(date ? { date } : {}),
    ...(title ? { title: title.slice(0, 100) } : {}),
  }
}

/** The edit form's fields from an event row (the edit fetch, or the cached detail row). */
export function formFromEvent(data: EventEditSource): CreateEventForm {
  return {
    title: data.title,
    description: data.description ?? '',
    location: data.location ?? '',
    locationLatitude: data.latitude ?? null,
    locationLongitude: data.longitude ?? null,
    date: new Date(data.event_date),
    durationMinutes: data.duration_minutes ?? DEFAULT_DURATION_MINUTES,
    maxAttendees: data.max_attendees,
    priceText: data.price != null ? Number(data.price).toFixed(2) : '',
    venmoHandle: data.venmo_handle ?? '',
    requiresApproval: data.requires_approval ?? false,
    surface: isSurface(data.surface) ? data.surface : null,
  }
}

/** Every start time a save creates: one for a single game, the series when Repeat is on (may be empty). */
export function eventDates(form: CreateEventForm, recurrence: HostRecurrence): Date[] {
  return generateEventDates(form.date, recurrence.enabled, recurrence.days, recurrence.cadence, recurrence.endDate)
}

/** Why the form can't be saved as it is, or null. */
export function hostFormProblem(form: CreateEventForm, recurrence: HostRecurrence): string | null {
  if (!form.title.trim()) return 'Add a title.'
  if (eventDates(form, recurrence).length === 0) return 'The recurrence settings produced no valid dates. Check the end date.'
  return null
}

type EventColumns = Omit<TablesInsert<'events'>, 'event_date' | 'created_by'>

/**
 * The `events` columns a save writes, apart from the start time and the host.
 * Text → number for the price happens here, once: the form keeps it as typed so
 * a host can type "5.50" at all. A Venmo handle is kept only for a paid game.
 */
export function eventColumns(form: CreateEventForm, clubId: string | null): EventColumns {
  const price = parsePrice(form.priceText)
  return {
    title: form.title,
    description: form.description || null,
    location: form.location || null,
    latitude: form.locationLatitude,
    longitude: form.locationLongitude,
    duration_minutes: form.durationMinutes,
    max_attendees: form.maxAttendees,
    club_id: clubId,
    price,
    venmo_handle: price && price > 0 ? (form.venmoHandle.trim() || null) : null,
    requires_approval: form.requiresApproval,
    surface: form.surface,
  }
}


/** Up to five distinct venues from the host's latest events (newest first), for the location field's quick picks. */
export function recentVenuesFrom(rows: { location: string | null; latitude: number | null; longitude: number | null }[]): LocationValue[] {
  const seen = new Set<string>()
  const unique: LocationValue[] = []
  for (const e of rows) {
    if (e.location && !seen.has(e.location)) {
      seen.add(e.location)
      unique.push({ display: e.location, latitude: e.latitude ?? null, longitude: e.longitude ?? null })
    }
  }
  return unique.slice(0, 5)
}

/** A saved template applied to the form: its text and cap; the template has no coordinates, so they clear. */
export function formWithTemplate(form: CreateEventForm, t: Pick<UserEventTemplate, 'title' | 'description' | 'location' | 'max_attendees'>): CreateEventForm {
  return {
    ...form,
    title: t.title,
    description: t.description ?? '',
    location: t.location ?? '',
    locationLatitude: null,
    locationLongitude: null,
    maxAttendees: t.max_attendees,
  }
}
