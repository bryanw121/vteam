import {
  EVENT_CARD_LIST_SELECT,
  EVENT_CARD_MY_ATTENDANCE_SELECT,
  EVENT_CARD_MY_ATTENDANCE_SELECT_ATTENDING_ONLY,
  EXTERNAL_SESSION_SELECT,
} from '../../constants'
import { supabase } from '../../lib/supabase'
import { getSessionUser } from '../../lib/sessionUser'
import type { EventWithDetails, ExternalSession } from '../../types'

// The feed without get_feed_span (#343: moved from hooks/useMonthEvents.ts unchanged).

export const TOURNAMENT_FEED_SELECT =
  'id, created_by, club_id, title, location, start_date, max_teams, price, skill_levels, status, created_at, profiles!tournaments_created_by_fkey(id, username, first_name, last_name, avatar_url), clubs(id, name, avatar_url)'

/** Previous path, kept as the fallback: one range query per table, previews fetched afterwards. */
export async function fetchFeedSpanQueries(
  rangeStart: string,
  rangeEnd: string,
  externalSince: string,
): Promise<{ events: EventWithDetails[]; tournaments: unknown[] | null; external: ExternalSession[] | null }> {
  const user = await getSessionUser()

  const buildEventsQuery = (mySelect: string | null) => {
    let q = supabase
      .from('events')
      .select(mySelect ? `${EVENT_CARD_LIST_SELECT}, ${mySelect}` : EVENT_CARD_LIST_SELECT)
      .gte('event_date', rangeStart)
      .lt('event_date', rangeEnd)
      .is('cancelled_at', null)
      .order('event_date', { ascending: true })
    if (user) q = q.eq('my_attendance.user_id', user.id)
    return q
  }

  /**
   * The `my_attendance` embed reads the base `event_attendees` table so the
   * row carries `status`. Migration files lag the live schema here, so if
   * PostgREST rejects that shape, fall back to the attending-only view: the
   * rail loses its waitlisted/pending states but the feed still renders.
   * Failing closed would blank the Events tab for every user.
   */
  const runEventsQuery = async () => {
    const first = await buildEventsQuery(user ? EVENT_CARD_MY_ATTENDANCE_SELECT : null)
    if (!first.error || !user) return first
    console.warn('[useMonthEvents] my_attendance embed rejected, retrying attending-only:', first.error.message)
    return buildEventsQuery(EVENT_CARD_MY_ATTENDANCE_SELECT_ATTENDING_ONLY)
  }

  const [eventsRes, tournamentsRes, externalRes] = await Promise.all([
    runEventsQuery(),
    supabase
      .from('tournaments')
      .select(TOURNAMENT_FEED_SELECT)
      .gte('start_date', rangeStart)
      .lt('start_date', rangeEnd)
      .neq('status', 'draft')
      .neq('status', 'cancelled'),
    // Sessions at other venues (Schelagg). A failure here only
    // drops those cards; the club's own events still render.
    supabase
      .from('external_sessions')
      .select(EXTERNAL_SESSION_SELECT)
      .gte('starts_at', rangeStart)
      .lt('starts_at', rangeEnd)
      .eq('canceled', false)
      .gte('updated_at', externalSince)
      .order('starts_at', { ascending: true }),
  ])

  // The club's own events are the feed: without them, surface the error (the
  // query layer keeps any previous data on screen). The other two are extras.
  if (eventsRes.error) throw eventsRes.error
  if (tournamentsRes.error) console.warn('[useMonthEvents] tournaments:', tournamentsRes.error.message)
  if (externalRes.error) console.warn('[useMonthEvents] external_sessions:', externalRes.error.message)

  return {
    // Runtime-chosen select string: PostgREST inference cannot parse it, hence the double cast.
    events: (eventsRes.data ?? []) as unknown as EventWithDetails[],
    tournaments: tournamentsRes.data as unknown[] | null,
    external: externalRes.data as ExternalSession[] | null,
  }
}
