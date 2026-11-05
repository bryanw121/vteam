/**
 * Share text and link-preview copy for an event (#130). Used by the app's share
 * button and by the Vercel functions that render previews (`api/event-page.ts`,
 * `api/og/event.tsx`), so the app and the preview card always say the same
 * thing. Keep it dependency-free: only other import-free modules and types.
 *
 * Times are written in `SHARE_TIME_ZONE` (the pilot region), not the device's
 * or the server's zone, so every recipient reads the same start time.
 */
import { SHARE_TIME_ZONE } from '../constants/share'
import { parseEventDate } from './eventDate'
import { formatPrice } from './price'
import type { EventPreviewMeta, EventPreviewRow, EventPreviewState } from '../types'

/** Minutes an event runs when the row has no duration (matches `DEFAULT_DURATION_MINUTES`). */
const FALLBACK_DURATION_MINUTES = 120

/** "Sat, Oct 31" */
export function formatShareDate(iso: string): string {
  return parseEventDate(iso).toLocaleDateString('en-US', {
    timeZone: SHARE_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric',
  })
}

/** "4:00 PM" */
export function formatShareTime(iso: string): string {
  return parseEventDate(iso).toLocaleTimeString('en-US', {
    timeZone: SHARE_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

/** "Fri 2:15 PM": when a preview's numbers were read. */
function formatAsOf(now: Date): string {
  return now.toLocaleString('en-US', {
    timeZone: SHARE_TIME_ZONE, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

/**
 * The share sheet / Web Share text, without the link (the caller adds it in
 * whatever way the platform wants): `"Sand Doubles" · Sat, Oct 31, 4:00 PM on vteam`.
 */
export function eventShareMessage(title: string | null | undefined, eventDate: string | null | undefined): string {
  const name = `"${title?.trim() || 'Event'}"`
  if (!eventDate) return `${name} on vteam`
  return `${name} · ${formatShareDate(eventDate)}, ${formatShareTime(eventDate)} on vteam`
}

/** "4 of 16 spots left", "Full · waitlist open", or "6 going" when there is no cap. */
export function spotsLabel(attending: number, maxAttendees: number | null | undefined): string {
  const going = Math.max(0, Math.floor(attending))
  if (maxAttendees == null || maxAttendees <= 0) return `${going} going`
  const left = maxAttendees - going
  if (left <= 0) return 'Full · waitlist open'
  return `${left} of ${maxAttendees} spot${maxAttendees === 1 ? '' : 's'} left`
}

/** Upcoming, cancelled or ended. `now` is passed in so tests (and the caller's clock) decide. */
export function eventPreviewState(event: EventPreviewRow, now: Date): EventPreviewState {
  if (event.cancelled_at) return 'cancelled'
  const endMs = parseEventDate(event.event_date).getTime() + (event.duration_minutes ?? FALLBACK_DURATION_MINUTES) * 60_000
  return now.getTime() > endMs ? 'ended' : 'upcoming'
}

export const GENERIC_PREVIEW: EventPreviewMeta = {
  state: 'missing',
  title: 'vteam',
  description: 'Find and join pickup volleyball: open play, leagues and tournaments.',
  imageAlt: 'vteam: pickup volleyball',
}

/**
 * The link preview for an event: what `og:title` / `og:description` say and
 * what the card image shows. `event` null (unknown id, not visible to guests)
 * gives the generic vteam card. Plain text: the caller HTML-escapes it.
 *
 * Previews are cached by the apps that show them, so the "as of" time sits in
 * the description only; the title and image carry the stable facts.
 */
export function buildEventMeta(event: EventPreviewRow | null, attending: number, now: Date): EventPreviewMeta {
  if (!event) return GENERIC_PREVIEW
  const title = event.title.trim() || 'Event'
  const date = formatShareDate(event.event_date)
  const time = formatShareTime(event.event_date)
  const where = event.location?.trim()
  const state = eventPreviewState(event, now)

  if (state === 'cancelled') {
    return {
      state,
      title: `Cancelled: ${title}`,
      description: ['Cancelled', `was ${date}, ${time} CT`, where].filter(Boolean).join(' · '),
      imageAlt: `${title}, cancelled`,
    }
  }
  if (state === 'ended') {
    return {
      state,
      title: `Ended: ${title}`,
      description: ['Ended', date, where].filter(Boolean).join(' · '),
      imageAlt: `${title}, ended ${date}`,
    }
  }
  const spots = spotsLabel(attending, event.max_attendees)
  return {
    state,
    title,
    description: [`${date}, ${time} CT`, where, `${spots} (as of ${formatAsOf(now)})`, formatPrice(event.price)]
      .filter(Boolean)
      .join(' · '),
    imageAlt: `${title}: ${date} at ${time}, ${spots}`,
  }
}
