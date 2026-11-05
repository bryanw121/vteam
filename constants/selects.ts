/**
 * PostgREST select fragments: the one place a column list is written down, so
 * a read and the insert/update that returns the same row (`.select(X)`) can't
 * drift apart. Name the embed's FK hint explicitly — several tables have more
 * than one FK to `profiles`.
 */

/**
 * What a link preview reads of an event (`api/event-page.ts`, `api/og/event.tsx`,
 * #130): only columns a guest already sees on the event page, read with the
 * anon key. `e2e/rls.spec.ts` asserts anon can still select them.
 */
export const EVENT_PREVIEW_COLUMNS = 'id,title,event_date,location,max_attendees,cancelled_at,price,duration_minutes'

/** A profile as shown in a byline, avatar or host row. */
export const PROFILE_BRIEF = 'id, username, first_name, last_name, avatar_url, selected_border'

/** A profile as shown on a roster card (adds position + skill). */
export const PROFILE_ROSTER = `${PROFILE_BRIEF}, position, skill_level`

/** `event_comments` row with its author. */
export const COMMENT_SELECT =
  `id, event_id, body, is_announcement, created_at, user_id, mentions, parent_id, edited_at, deleted_at, profiles!event_comments_user_id_fkey (${PROFILE_BRIEF})`

/** `event_guests` (+1) row with the adder's username. */
export const GUEST_SELECT =
  'id, event_id, status, added_by, joined_at, team_number, team_pinned, first_name, last_name, adder:profiles!event_guests_added_by_fkey (id, username)'

/** `event_cohosts` row with the co-host's profile. */
export const COHOST_SELECT =
  `event_id, user_id, added_by, added_at, profiles!event_cohosts_user_id_fkey (${PROFILE_BRIEF})`

/**
 * `event_attendees` row with the attendee's profile. `denial_reason` is left out
 * on purpose: every viewer of the event reads these rows.
 */
export const ATTENDEE_SELECT =
  `event_id, user_id, joined_at, team_number, team_pinned, status, profiles!event_attendees_user_id_fkey (${PROFILE_ROSTER})`

/** `cheers` row. */
export const CHEER_SELECT = 'id, event_id, giver_id, receiver_id, cheer_type, created_at'

/**
 * `events` columns the event detail screen renders. Includes the coordinates so
 * the cached row also holds every field of the host edit form (EVENT_EDIT_SELECT),
 * which then paints from it without waiting.
 */
export const EVENT_DETAIL_COLUMNS =
  'id, created_by, club_id, title, description, location, latitude, longitude, event_date, duration_minutes, max_attendees, created_at, price, venmo_handle, requires_approval, surface'

/** The host edit form (`/host?edit=`): the editable columns and the tag ids. */
export const EVENT_EDIT_SELECT =
  'id, title, description, location, latitude, longitude, event_date, duration_minutes, max_attendees, price, venmo_handle, requires_approval, surface, club_id, event_tags (tag_id)'

/** Event detail: the row, its host, every attendee with profile, and its tags. */
export const EVENT_DETAIL_SELECT =
  `${EVENT_DETAIL_COLUMNS}, profiles!events_created_by_fkey (${PROFILE_BRIEF}), event_attendees (${ATTENDEE_SELECT}), event_tags (tag_id, tags (id, name, category, display_order))`
