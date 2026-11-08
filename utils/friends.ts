import { FRIEND_COPY } from '../constants/friends'
import { profileDisplayName } from './index'
import type { EventAttendeeWithProfile, Friend, FriendGoing, FriendRequest, FriendsData, FriendStatus } from '../types'

/** My relationship to `userId`, from my friends and pending requests. */
export function friendStatusOf(data: FriendsData | undefined, userId: string): FriendStatus {
  if (!data) return 'none'
  if (data.friends.some(f => f.friend_id === userId)) return 'friends'
  if (data.incoming.some(r => r.requester_id === userId)) return 'incoming'
  if (data.outgoing.some(r => r.addressee_id === userId)) return 'requested'
  return 'none'
}

/** Best friends first, then by display name. */
export function sortFriends(friends: Friend[]): Friend[] {
  const name = (f: Friend) => (f.profile ? profileDisplayName(f.profile) : '').toLowerCase()
  return [...friends].sort((a, b) => Number(b.is_best_friend) - Number(a.is_best_friend) || name(a).localeCompare(name(b)))
}

/** Incoming requests from people I haven't silenced, newest first. */
export function visibleIncoming(incoming: FriendRequest[], silenced: ReadonlySet<string>): FriendRequest[] {
  return incoming.filter(r => !silenced.has(r.requester_id)).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function shortName(f: Pick<FriendGoing, 'first_name' | 'username'>): string {
  return f.first_name?.trim() || f.username?.trim() || 'A friend'
}

/**
 * "Ana is going", "Ana and Ben are going", "Ana and 2 friends going".
 * Best friends first, then in RSVP order (the order get_friends_going returns).
 * Empty string when no friends are going.
 */
export function friendsGoingLabel(going: readonly FriendGoing[] | undefined): string {
  if (!going || going.length === 0) return ''
  const sorted = [...going].sort((a, b) => Number(b.is_best_friend) - Number(a.is_best_friend))
  const first = shortName(sorted[0])
  if (sorted.length === 1) return `${first} is going`
  if (sorted.length === 2) return `${first} and ${shortName(sorted[1])} are going`
  return `${first} and ${sorted.length - 1} friends going`
}

/** Groups get_friends_going rows by event id. */
export function groupFriendsGoing(rows: readonly FriendGoing[]): Map<string, FriendGoing[]> {
  const map = new Map<string, FriendGoing[]>()
  for (const row of rows) {
    const list = map.get(row.event_id)
    if (list) list.push(row)
    else map.set(row.event_id, [row])
  }
  return map
}

/** User-facing message for a failed friend RPC (PostgREST error codes from the friends migration). */
export function friendErrorMessage(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error) return null
  const code = error.code ?? ''
  const message = error.message ?? ''
  if (code === 'PT429' || (/limit reached/.test(message) && /friend request/.test(message))) return FRIEND_COPY.limitReached
  if (code === '42501' || /not allowed/.test(message)) return FRIEND_COPY.notAllowed
  if (code === '23514' || /best friend limit/.test(message)) return FRIEND_COPY.bestFriendLimit
  if (code === 'P0002') return FRIEND_COPY.gone
  return null
}

/**
 * Friends going, from an event's loaded attendee rows (event detail already
 * has every attendee, so no RPC): attending only, best friends first, then
 * in RSVP order.
 */
export function friendsGoingFromAttendees(
  eventId: string,
  attendees: readonly EventAttendeeWithProfile[],
  friends: readonly Friend[],
): FriendGoing[] {
  if (friends.length === 0) return []
  const best = new Map(friends.map(f => [f.friend_id, f.is_best_friend]))
  return attendees
    .filter(a => a.status === 'attending' && best.has(a.user_id))
    .sort((a, b) => Number(best.get(b.user_id)) - Number(best.get(a.user_id)) || (a.joined_at ?? '').localeCompare(b.joined_at ?? ''))
    .map(a => ({
      event_id: eventId,
      user_id: a.user_id,
      username: a.profiles?.username ?? '',
      first_name: a.profiles?.first_name ?? '',
      avatar_url: a.profiles?.avatar_url ?? '',
      is_best_friend: best.get(a.user_id) === true,
    }))
}
