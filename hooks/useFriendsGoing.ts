import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { STALE } from '../constants/cache'
import { useSession } from '../contexts/session'
import { useFriends, FRIENDS_PREFIX } from './useFriends'
import { groupFriendsGoing } from '../utils/friends'
import type { FriendGoing } from '../types'

/** get_friends_going refuses more than this many ids. */
const MAX_IDS = 500
/** PostgREST "function not found": the friends migration isn't applied yet. */
const MISSING_FUNCTION = 'PGRST202'
const EMPTY = new Map<string, FriendGoing[]>()

/** Short stable key part for a set of ids (djb2), so the cache key stays small. */
export function idsHash(ids: readonly string[]): string {
  let h = 5381
  for (const id of ids) for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0
  return `${ids.length}-${(h >>> 0).toString(36)}`
}

/**
 * Which of my friends are going to each of `eventIds` (#15), best friends
 * first, in one RPC for the whole set. No request for guests or for people
 * with no friends yet.
 */
export function useFriendsGoing(eventIds: readonly string[]): Map<string, FriendGoing[]> {
  const { userId } = useSession()
  const { data: friends } = useFriends()
  const ids = useMemo(() => [...new Set(eventIds)].sort().slice(0, MAX_IDS), [eventIds])
  const enabled = !!userId && friends.friends.length > 0 && ids.length > 0
  const key = enabled ? queryKey(FRIENDS_PREFIX, 'going', userId, idsHash(ids)) : null
  const { data } = useQuery<Map<string, FriendGoing[]>>(
    key,
    async () => {
      const { data: rows, error } = await supabase.rpc('get_friends_going', { p_event_ids: ids })
      if (error) {
        if (error.code === MISSING_FUNCTION) return EMPTY
        throw error
      }
      return groupFriendsGoing((rows ?? []) as FriendGoing[])
    },
    { staleMs: STALE.friends, keepPreviousData: true },
  )
  return enabled ? data ?? EMPTY : EMPTY
}
