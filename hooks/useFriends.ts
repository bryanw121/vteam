import { useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getQueryData, queryKey, setQueryData, useMutation, useQuery } from '../lib/query'
import { STALE } from '../constants/cache'
import { PROFILE_BRIEF } from '../constants/selects'
import { useSession } from '../contexts/session'
import type { Friend, FriendRequest, FriendsData, ProfileBrief } from '../types'

const FRIENDSHIP_SELECT = `friend_id, is_best_friend, created_at, profile:profiles!friendships_friend_id_fkey (${PROFILE_BRIEF})`
const REQUEST_SELECT =
  `id, requester_id, addressee_id, created_at, requester:profiles!friend_requests_requester_id_fkey (${PROFILE_BRIEF}), addressee:profiles!friend_requests_addressee_id_fkey (${PROFILE_BRIEF})`

/** Prefix of every friends cache entry (user-scoped: see useCacheUserScope). */
export const FRIENDS_PREFIX = 'friends'

export function friendsKey(userId: string): string {
  return queryKey(FRIENDS_PREFIX, 'list', userId)
}

type RequestRow = Omit<FriendRequest, 'other'> & { requester: ProfileBrief | null; addressee: ProfileBrief | null }

/** Splits pending request rows into incoming and outgoing for `userId`. */
export function splitRequests(rows: RequestRow[], userId: string): Pick<FriendsData, 'incoming' | 'outgoing'> {
  const incoming: FriendRequest[] = []
  const outgoing: FriendRequest[] = []
  for (const { requester, addressee, ...r } of rows) {
    if (r.addressee_id === userId) incoming.push({ ...r, other: requester })
    else if (r.requester_id === userId) outgoing.push({ ...r, other: addressee })
  }
  return { incoming, outgoing }
}

async function fetchFriends(userId: string): Promise<FriendsData> {
  // RLS returns only my own friendship rows and pending requests I'm part of.
  const [friendsRes, requestsRes] = await Promise.all([
    supabase.from('friendships').select(FRIENDSHIP_SELECT).eq('user_id', userId),
    supabase.from('friend_requests').select(REQUEST_SELECT).eq('status', 'pending'),
  ])
  if (friendsRes.error) throw friendsRes.error
  if (requestsRes.error) throw requestsRes.error
  return {
    friends: (friendsRes.data ?? []) as unknown as Friend[],
    ...splitRequests((requestsRes.data ?? []) as unknown as RequestRow[], userId),
  }
}

const EMPTY: FriendsData = { friends: [], incoming: [], outgoing: [] }

/**
 * My friends and pending friend requests (#15). Signed-out viewers get the
 * empty set and no request is made: guests see no friend data.
 */
export function useFriends() {
  const { userId } = useSession()
  const key = userId ? friendsKey(userId) : null
  const query = useQuery<FriendsData>(key, () => fetchFriends(userId as string), { staleMs: STALE.friends })
  return { ...query, data: query.data ?? EMPTY, hasData: query.data !== undefined, key }
}

export type FriendAction =
  | { kind: 'send'; userId: string; profile?: ProfileBrief | null }
  | { kind: 'cancel'; userId: string }
  | { kind: 'respond'; requestId: string; accept: boolean }
  | { kind: 'remove'; userId: string }
  | { kind: 'best'; userId: string; best: boolean }

async function runAction(action: FriendAction): Promise<unknown> {
  const call = () => {
    switch (action.kind) {
      case 'send': return supabase.rpc('send_friend_request', { p_user_id: action.userId })
      case 'cancel': return supabase.rpc('cancel_friend_request', { p_user_id: action.userId })
      case 'respond': return supabase.rpc('respond_friend_request', { p_request_id: action.requestId, p_accept: action.accept })
      case 'remove': return supabase.rpc('remove_friend', { p_user_id: action.userId })
      case 'best': return supabase.rpc('set_best_friend', { p_user_id: action.userId, p_best: action.best })
    }
  }
  const { data, error } = await call()
  if (error) throw error
  return data
}

/** The optimistic version of `data` after `action` (the server result replaces it on refetch). */
export function applyFriendAction(data: FriendsData, action: FriendAction, me: string): FriendsData {
  const now = new Date().toISOString()
  switch (action.kind) {
    case 'send': {
      const incoming = data.incoming.find(r => r.requester_id === action.userId)
      // Asking someone who already asked me accepts their request.
      if (incoming) return applyFriendAction(data, { kind: 'respond', requestId: incoming.id, accept: true }, me)
      if (data.outgoing.some(r => r.addressee_id === action.userId) || data.friends.some(f => f.friend_id === action.userId)) return data
      return {
        ...data,
        outgoing: [...data.outgoing, { id: `pending-${action.userId}`, requester_id: me, addressee_id: action.userId, created_at: now, other: action.profile ?? null }],
      }
    }
    case 'cancel':
      return { ...data, outgoing: data.outgoing.filter(r => r.addressee_id !== action.userId) }
    case 'respond': {
      const req = data.incoming.find(r => r.id === action.requestId)
      const incoming = data.incoming.filter(r => r.id !== action.requestId)
      if (!req || !action.accept) return { ...data, incoming }
      return {
        ...data,
        incoming,
        friends: [...data.friends, { friend_id: req.requester_id, is_best_friend: false, created_at: now, profile: req.other }],
      }
    }
    case 'remove':
      return { ...data, friends: data.friends.filter(f => f.friend_id !== action.userId) }
    case 'best':
      return { ...data, friends: data.friends.map(f => (f.friend_id === action.userId ? { ...f, is_best_friend: action.best } : f)) }
  }
}

/**
 * Friend actions, optimistic on the friends cache. Each goes through a
 * SECURITY DEFINER RPC (clients can't write the tables). `run` resolves to the
 * error after rolling back; `friendErrorMessage` (utils/friends) turns it into copy.
 */
export function useFriendActions() {
  const { userId } = useSession()
  const lastError = useRef<Error | null>(null)
  const mutation = useMutation<FriendAction, unknown>(runAction, {
    onMutate: action => {
      lastError.current = null
      if (!userId) return
      const key = friendsKey(userId)
      const previous = getQueryData<FriendsData>(key)
      if (!previous) return
      setQueryData<FriendsData>(key, applyFriendAction(previous, action, userId))
      return () => setQueryData<FriendsData>(key, previous)
    },
    onError: error => { lastError.current = error },
    invalidates: [FRIENDS_PREFIX],
  })
  const { mutate } = mutation
  /** Runs the action. Resolves to the error (already rolled back) or null. */
  const run = useCallback(async (action: FriendAction): Promise<Error | null> => {
    await mutate(action)
    return lastError.current
  }, [mutate])
  return { run, isPending: mutation.isPending }
}
