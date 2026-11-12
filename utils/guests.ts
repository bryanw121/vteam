import type { EventGuest, EventGuestPublicRow } from '../types'

/** Name shown for a +1 whose real name the viewer can't read (signed out). */
export const ANONYMOUS_GUEST_NAME = 'Guest'

/** A row of the name-free `event_guests_attending` view → an `EventGuest` named "Guest". */
export function toAnonymousGuest(row: EventGuestPublicRow): EventGuest {
  return {
    // View columns are nullable in the generated types; the base table's aren't.
    id: row.id ?? '',
    event_id: row.event_id ?? '',
    added_by: row.added_by ?? '',
    status: row.status === 'waitlisted' ? 'waitlisted' : 'attending',
    joined_at: row.joined_at ?? '',
    team_number: row.team_number,
    team_pinned: row.team_pinned ?? false,
    first_name: ANONYMOUS_GUEST_NAME,
    last_name: '',
    adder: null,
  }
}

/** Short roster label: "Jordan R." (or just the first name when there is no last name). */
export function guestShortName(g: Pick<EventGuest, 'first_name' | 'last_name'>): string {
  return g.last_name ? `${g.first_name} ${g.last_name.charAt(0)}.` : g.first_name
}

/** Full label for menus and accessibility: "Jordan Rivera" or "Guest". */
export function guestFullName(g: Pick<EventGuest, 'first_name' | 'last_name'>): string {
  return g.last_name ? `${g.first_name} ${g.last_name}` : g.first_name
}

/** Avatar initials: "JR", or one letter without a last name. */
export function guestInitials(g: Pick<EventGuest, 'first_name' | 'last_name'>): string {
  return (g.first_name.charAt(0) + g.last_name.charAt(0)).toUpperCase()
}
