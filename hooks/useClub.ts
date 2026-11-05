import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import type { QueryResult } from '../lib/query'
import { STALE } from '../constants/cache'
import { EVENT_CARD_LIST_SELECT, EVENT_CARD_MY_ATTENDANCE_SELECT } from '../constants/events'
import { useSession } from '../contexts/session'
import { attachEventCardPreviews } from '../utils/eventCardPreviews'
import type { ClubDetailData, ClubPostsData, ClubPostWithFeed, ClubWithDetails, EventWithDetails } from '../types'

const MEMBER_PROFILE = 'id, username, first_name, last_name, avatar_url, selected_border'

export const CLUB_POST_FEED_SELECT = `
  id, club_id, body, created_at, created_by,
  profiles:created_by (${MEMBER_PROFILE}),
  club_post_likes (count),
  club_post_comments (
    id, body, created_at, user_id,
    profiles:user_id (${MEMBER_PROFILE})
  )
`

/** The viewer's own like rows, embedded per post so no second round trip is needed. */
const MY_LIKES_EMBED = 'my_likes:club_post_likes (club_post_id)'

export const CLUB_DETAIL_SELECT =
  'id, name, description, membership_type, created_by, avatar_url, cover_url, created_at, major_city_id, location_name, location_address, latitude, longitude, place_id, major_cities (id, display_name, city_name, admin_region, country_code), club_members (club_id, user_id, role, joined_at, profiles (id, username, first_name, last_name, avatar_url))'

/** Cache key of a club page's header + events for one viewer (guests share `_`). */
export function clubDetailKey(clubId: string, userId: string | null): string {
  return queryKey('club', clubId, 'detail', userId)
}

/** Cache key of a club's updates feed for one viewer. */
export function clubPostsKey(clubId: string, userId: string): string {
  return queryKey('club', clubId, 'posts', userId)
}

/**
 * Club header, upcoming events and past count in one parallel batch; attendee
 * previews are the only dependent request (they need the event ids).
 */
export async function fetchClubDetail(clubId: string, userId: string | null): Promise<ClubDetailData> {
  const nowIso = new Date().toISOString()
  let eventsQuery = supabase
    .from('events')
    .select(userId ? `${EVENT_CARD_LIST_SELECT}, ${EVENT_CARD_MY_ATTENDANCE_SELECT}` : EVENT_CARD_LIST_SELECT)
    .eq('club_id', clubId)
    .gte('event_date', nowIso)
    .order('event_date', { ascending: true })
  if (userId) eventsQuery = eventsQuery.eq('my_attendance.user_id', userId)

  const [clubRes, eventsRes, pastRes] = await Promise.all([
    supabase.from('clubs').select(CLUB_DETAIL_SELECT).eq('id', clubId).maybeSingle(),
    eventsQuery,
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('club_id', clubId).lt('event_date', nowIso),
  ])
  if (clubRes.error) throw clubRes.error
  if (eventsRes.error) throw eventsRes.error

  const club = (clubRes.data ?? null) as ClubWithDetails | null
  // The events select is chosen at runtime (with/without my_attendance), so PostgREST inference gives up.
  const upcomingEvents = club
    ? await attachEventCardPreviews((eventsRes.data ?? []) as unknown as EventWithDetails[])
    : []
  return { club, upcomingEvents, pastCount: pastRes.count ?? 0 }
}

/** The club's updates with the viewer's likes folded in. RLS returns nothing to non-members. */
export async function fetchClubPosts(clubId: string, userId: string): Promise<ClubPostsData> {
  const { data, error } = await supabase
    .from('club_posts')
    .select(`${CLUB_POST_FEED_SELECT}, ${MY_LIKES_EMBED}`)
    .eq('club_id', clubId)
    .eq('my_likes.user_id', userId)
    .order('created_at', { ascending: false })
    .order('created_at', { foreignTable: 'club_post_comments', ascending: true })
  if (error) throw error

  const rows = (data ?? []) as (ClubPostWithFeed & { my_likes?: { club_post_id: string }[] })[]
  const likedPostIds: string[] = []
  const posts = rows.map(({ my_likes, ...post }) => {
    if (my_likes && my_likes.length > 0) likedPostIds.push(post.id)
    return post as ClubPostWithFeed
  })
  return { posts, likedPostIds }
}

/**
 * A club page's header, events and counts. Runs alongside `useClubPosts` (a
 * separate cache entry) so the two requests overlap on a cold open.
 */
export function useClubDetail(clubId: string): QueryResult<ClubDetailData> {
  const { userId, loading } = useSession()
  return useQuery<ClubDetailData>(
    clubDetailKey(clubId, userId),
    () => fetchClubDetail(clubId, userId),
    { staleMs: STALE.detail, enabled: !loading },
  )
}

/** A club's updates feed; idle for guests. Refetch it alone after a like or comment. */
export function useClubPosts(clubId: string): QueryResult<ClubPostsData> {
  const { userId, loading } = useSession()
  return useQuery<ClubPostsData>(
    userId ? clubPostsKey(clubId, userId) : null,
    () => fetchClubPosts(clubId, userId as string),
    { staleMs: STALE.detail, enabled: !loading && userId !== null },
  )
}
