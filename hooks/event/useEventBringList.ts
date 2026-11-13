import { useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { getQueryData, setQueryData, useFocusRefetch, useMutation, useQuery } from '../../lib/query'
import { track } from '../../lib/analytics'
import { toast } from '../../lib/toast'
import { STALE } from '../../constants'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { BRING_COPY } from '../../constants/bringItems'
import { applyClaim } from '../../utils/bringList'
import { eventKeys } from './keys'
import type { BringItem, ClaimBringItemArgs, ReleaseBringItemArgs, Surface } from '../../types'

/** `get_event_bring_list`: the event's items with coverage (names only for signed-in callers). */
export async function fetchBringList(eventId: string): Promise<BringItem[]> {
  // TEMPORARY cast: the bring-list RPCs aren't in types/database.ts until it is regenerated from live after merge (#256).
  const { data, error } = await supabase.rpc('get_event_bring_list' as never, { p_event_id: eventId } as never)
  if (error) throw error
  return ((data ?? []) as unknown as BringItem[]).map(i => ({ ...i, claimers: Array.isArray(i.claimers) ? i.claimers : [] }))
}

type Options = {
  /** Read only when the card can show (the Details tab is mounted). */
  enabled?: boolean
  surface?: Surface | null
}

/**
 * What to bring on one event (#256): the list, and claim / release for the
 * viewer. Both writes are optimistic (the button flips at once) and roll back
 * with a toast when the server says no (already covered, game started, left
 * the game).
 */
export function useEventBringList(eventId: string, userId: string | null, opts: Options = {}) {
  const key = eventKeys.bring(eventId, userId)
  const enabled = opts.enabled ?? true
  const query = useQuery<BringItem[]>(key, () => fetchBringList(eventId), { staleMs: STALE.detail, enabled })
  useFocusRefetch(enabled ? key : null)
  const surface = opts.surface ?? 'unknown'

  const optimistic = useCallback((itemId: string, quantity: number) => {
    const prev = getQueryData<BringItem[]>(key)
    if (prev && userId) setQueryData<BringItem[]>(key, applyClaim(prev, itemId, userId, quantity))
    return () => { if (prev) setQueryData<BringItem[]>(key, prev) }
  }, [key, userId])

  const claim = useMutation(
    async (vars: { item: BringItem; quantity: number }) => {
      const args: ClaimBringItemArgs = { p_item_id: vars.item.id, p_quantity: vars.quantity }
      const { error } = await supabase.rpc('claim_bring_item' as never, args as never)
      if (error) throw error
      return true
    },
    {
      onMutate: vars => optimistic(vars.item.id, vars.quantity),
      onSuccess: (_r, vars) => {
        track(ANALYTICS_EVENTS.bringItemClaimed, { surface, required: vars.item.required })
        toast.show({ message: BRING_COPY.claimed(vars.item.label), variant: 'success' })
      },
      onError: (e, vars) => toast.error(BRING_COPY.claimFailed, e, { label: 'Retry', onPress: () => void claim.mutate(vars) }),
      invalidates: [key],
    },
  )

  const release = useMutation(
    async (vars: { item: BringItem }) => {
      const args: ReleaseBringItemArgs = { p_item_id: vars.item.id }
      const { error } = await supabase.rpc('release_bring_item' as never, args as never)
      if (error) throw error
      return true
    },
    {
      onMutate: vars => optimistic(vars.item.id, 0),
      onSuccess: (_r, vars) => {
        track(ANALYTICS_EVENTS.bringItemReleased, { surface })
        toast.show({
          message: BRING_COPY.released(vars.item.label),
          variant: 'info',
          action: { label: 'Undo', onPress: () => void claim.mutate({ item: vars.item, quantity: Math.max(1, vars.item.claimers.find(c => c.user_id === userId)?.quantity ?? 1) }) },
        })
      },
      onError: e => toast.error(BRING_COPY.claimFailed, e),
      invalidates: [key],
    },
  )

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    claim: (item: BringItem, quantity = 1) => void claim.mutate({ item, quantity }),
    release: (item: BringItem) => void release.mutate({ item }),
    pending: claim.isPending || release.isPending,
  }
}
