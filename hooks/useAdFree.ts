import { supabase } from '../lib/supabase'
import { queryKey, setQueryData, useMutation, useQuery } from '../lib/query'
import type { QueryResult } from '../lib/query'
import { STALE } from '../constants/cache'
import { useSession } from '../contexts/session'
import { Sentry } from '../lib/sentry'
import { pointsBalanceKey } from './usePoints'
import type { AdFreeRedeemResult, AdFreeStatus } from '../types'

/** Cache key of the signed-in user's ad-free status (offer, balance, expiry). */
export function adFreeStatusKey(userId: string): string {
  return queryKey('adfree', userId)
}

/**
 * The signed-in user's ad-free status from `get_ad_free_status()`: the price
 * (`cost` points for `days` days, set server-side in `ad_free_offer()`), their
 * points balance and `ad_free_until`. Guests have none.
 */
export function useAdFreeStatus(opts?: { enabled?: boolean }): QueryResult<AdFreeStatus> {
  const { userId } = useSession()
  return useQuery<AdFreeStatus>(
    userId ? adFreeStatusKey(userId) : null,
    async () => {
      const { data, error } = await supabase.rpc('get_ad_free_status')
      if (error) throw error
      return data as unknown as AdFreeStatus
    },
    { staleMs: STALE.profile, enabled: (opts?.enabled ?? true) && userId !== null },
  )
}

/**
 * Spend points on an ad-free period (`redeem_ad_free()`, atomic server-side).
 * Resolves to the result (with `ok: false` when the balance is too low), or
 * undefined on a network/server error. Updates the status and the profile's
 * points total in the cache.
 */
export function useRedeemAdFree() {
  const { userId } = useSession()
  return useMutation<void, AdFreeRedeemResult>(
    async () => {
      const { data, error } = await supabase.rpc('redeem_ad_free')
      if (error) throw error
      return data as unknown as AdFreeRedeemResult
    },
    {
      onSuccess: result => {
        if (!userId) return
        const { ok: _ok, reason: _reason, ...status } = result
        setQueryData<AdFreeStatus>(adFreeStatusKey(userId), status)
        setQueryData<number>(pointsBalanceKey(userId), result.balance)
      },
      onError: error => Sentry.captureException(error),
    },
  )
}
