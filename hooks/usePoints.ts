import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import type { QueryResult } from '../lib/query'
import { STALE } from '../constants/cache'

/**
 * Cache key of a user's points balance. Shared by the own Profile tab and
 * other players' profiles, so both read one entry per user.
 */
export function pointsBalanceKey(userId: string): string {
  return queryKey('points', 'balance', userId)
}

/**
 * A user's accumulated points (`point_balances`, kept by a trigger on the
 * server-written ledger `point_events`). Public, so guests see it on profiles.
 * A user with no awards yet has no row: that reads as 0.
 */
export function usePointsBalance(userId: string | null | undefined, opts?: { enabled?: boolean }): QueryResult<number> {
  return useQuery<number>(
    userId ? pointsBalanceKey(userId) : null,
    async () => {
      const { data, error } = await supabase
        .from('point_balances')
        .select('balance')
        .eq('user_id', userId as string)
        .maybeSingle()
      if (error) throw error
      return data?.balance ?? 0
    },
    { staleMs: STALE.profile, enabled: (opts?.enabled ?? true) && !!userId },
  )
}
