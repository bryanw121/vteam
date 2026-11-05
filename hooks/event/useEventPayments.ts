import { useEffect, useMemo, useRef } from 'react'
import { Alert } from 'react-native'
import { supabase } from '../../lib/supabase'
import { getQueryData, invalidate, setQueryData, useFocusRefetch, useMutation, useQuery } from '../../lib/query'
import { GENERIC_ERROR_MESSAGE, STALE } from '../../constants'
import { eventKeys } from './keys'
import { reportEventError } from './telemetry'

const NONE: string[] = []

/** User ids with an "I've paid" row on this event that RLS lets the viewer read. */
export async function fetchEventPayments(eventId: string): Promise<string[]> {
  const { data, error } = await supabase.from('event_payments').select('user_id').eq('event_id', eventId)
  if (error) throw error
  return (data ?? []).map(r => r.user_id)
}

/**
 * The "I've paid" self-toggle (#6). One row in `event_payments` per attendee
 * who says they've paid; the attendee inserts or deletes only their own (RLS),
 * the host and co-hosts can read all of them. Fetched only when the viewer can
 * see something (`enabled`). Toggling is optimistic with rollback.
 */
export function useEventPayments(
  eventId: string,
  userId: string | null,
  opts: { enabled: boolean; onRoster: boolean },
) {
  const key = userId ? eventKeys.payments(eventId, userId) : null
  const query = useQuery(key, () => fetchEventPayments(eventId), { staleMs: STALE.detail, enabled: opts.enabled })
  useFocusRefetch(opts.enabled ? key : null)

  // Leaving the event deletes the row server-side (cascade). Drop our cached
  // copy when the viewer leaves the roster so a re-join doesn't show "paid".
  const wasOnRoster = useRef(opts.onRoster)
  useEffect(() => {
    if (wasOnRoster.current && !opts.onRoster && key) {
      setQueryData<string[]>(key, prev => (prev ?? NONE).filter(id => id !== userId))
      invalidate(key)
    }
    wasOnRoster.current = opts.onRoster
  }, [opts.onRoster, key, userId])

  const paidUserIds = useMemo(() => new Set(query.data ?? NONE), [query.data])
  const iPaid = !!userId && paidUserIds.has(userId)

  const toggle = useMutation(
    async (paid: boolean) => {
      if (!userId) throw new Error('Sign in to continue.')
      const res = paid
        ? await supabase.from('event_payments').upsert(
            { event_id: eventId, user_id: userId },
            { onConflict: 'event_id,user_id', ignoreDuplicates: true },
          )
        : await supabase.from('event_payments').delete().eq('event_id', eventId).eq('user_id', userId)
      if (res.error) throw res.error
    },
    {
      onMutate: paid => {
        if (!key || !userId) return
        const prev = getQueryData<string[]>(key) ?? NONE
        const without = prev.filter(id => id !== userId)
        setQueryData<string[]>(key, paid ? [...without, userId] : without)
        return () => setQueryData<string[]>(key, prev)
      },
      onError: e => {
        reportEventError(eventId, userId, 'payments.toggle', e)
        Alert.alert('Could not save', GENERIC_ERROR_MESSAGE)
      },
    },
  )

  return {
    paidUserIds,
    iPaid,
    loading: query.isLoading,
    setPaid: (paid: boolean) => { void toggle.mutate(paid) },
    saving: toggle.isPending,
    refetch: () => query.refetch({ force: true }),
  }
}
