import { STALE } from '../constants/cache'
import { queryKey, useQuery } from '../lib/query'
import { fetchUserTrophies } from './tournament/api'

export const userTrophiesKey = (userId: string | null) => queryKey('trophies', userId)

/** A player's tournament trophies (public), newest first. Disabled without a user id. */
export function useUserTrophies(userId: string | null) {
  return useQuery(userTrophiesKey(userId), () => fetchUserTrophies(userId as string), {
    staleMs: STALE.profile,
    enabled: !!userId,
  })
}
