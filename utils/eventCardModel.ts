import { theme } from '../constants/theme'
import { SURFACE_LABELS } from '../constants/events'
import { eventAttendeeDisplayCount, surfaceOf } from './index'
import type { EventCardModel, EventWithDetails, Tag } from '../types'

/**
 * Everything an event card says about a game (#360), worked out once for both
 * layouts: `EventCard` (phone feed, search, history, hosted, club, recap) and
 * `RowEventCard` (desktop feed). Pure, so the rules players read ("5 spots
 * left", "Waitlisted") have unit tests and the two cards can't disagree.
 */

/**
 * Is this viewer-scoped `my_attendance` row an actual RSVP? The embed reads the
 * base `event_attendees` table, so it also returns waitlisted, requested and
 * denied rows; presence alone would show "Going ✓" to someone only on the
 * waitlist. Rows with no `status` come from the older attending-only view.
 */
export function isAttendingRow(row: { status?: string }): boolean {
  return (row.status ?? 'attending') === 'attending'
}

/**
 * Label for a viewer the card must not RSVP with one tap: waitlisted or with a
 * pending request (a tap would insert a second row), or not yet on an event
 * whose host approves each join (`requires_approval`). Shown as a status pill;
 * tapping it opens the event, where they can leave / cancel / request.
 */
export function awaitingLabel(event: EventWithDetails, userId: string | null | undefined, isAttending: boolean): string | null {
  if (!userId) return null
  const status = event.my_attendance?.find(a => a.user_id === userId)?.status
  if (status === 'waitlisted') return 'Waitlisted'
  if (status === 'requested') return 'Requested'
  if (event.requires_approval && !isAttending) return status === 'denied' ? 'Denied' : 'Needs approval'
  return null
}

export function isTournamentTag(tags: Tag[]): boolean {
  return tags.some(t => t.name.toLowerCase().includes('tournament'))
}

/** Day, date and "7:00 PM" in the device's time zone (a bare timestamp is UTC). */
export function cardDateParts(dateString: string): { day: string; date: number; time: string } {
  const normalized = /[Z+]/.test(dateString) ? dateString : dateString + 'Z'
  const d = new Date(normalized)
  const day = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]
  const hours = d.getHours()
  const time = `${hours % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
  return { day, date: d.getDate(), time }
}

function tagsOf(event: EventWithDetails, category: string): Tag[] {
  return event.event_tags
    ?.filter(et => et.tags.category === category)
    .map(et => et.tags)
    .sort((a, b) => a.display_order - b.display_order) ?? []
}

export function eventCardModel(event: EventWithDetails, userId: string | null | undefined): EventCardModel {
  const isAttending = !!userId && (
    event.my_attendance != null
      ? event.my_attendance.some(a => a.user_id === userId && isAttendingRow(a))
      : (event.attendee_previews ?? []).some(p => p.user_id === userId)
  )
  const attendeeCount = eventAttendeeDisplayCount(event)
  const spotsLeft = event.max_attendees != null ? Math.max(0, event.max_attendees - attendeeCount) : null
  const typeTags = tagsOf(event, 'event_type')
  const isTournament = isTournamentTag(typeTags)
  const previews = (event.attendee_previews ?? []).slice(0, 3)
  const surface = surfaceOf(event)
  return {
    isAttending,
    awaiting: awaitingLabel(event, userId, isAttending),
    attendeeCount,
    spotsLeft,
    isFull: spotsLeft === 0,
    fillRatio: event.max_attendees ? Math.min(1, attendeeCount / event.max_attendees) : 0,
    typeTags,
    skillTags: tagsOf(event, 'skill_level'),
    isTournament,
    accent: isTournament ? theme.colors.warm : theme.colors.primaryText,
    previews,
    overflow: attendeeCount > previews.length ? attendeeCount - previews.length : 0,
    surfaceLabel: surface ? SURFACE_LABELS[surface] : null,
    ...cardDateParts(event.event_date),
  }
}
