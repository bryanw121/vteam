import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getQueryData, setQueryData, useMutation, useQuery } from '../../lib/query'
import { CHEER_SELECT, CHEERS_MAX_PER_EVENT, STALE } from '../../constants'
import type { Cheer, CheerType, PendingCheer } from '../../types'
import { eventKeys } from './keys'
import { reportEventError } from './telemetry'
import { toast } from '../../lib/toast'


const NO_CHEERS: Cheer[] = []
const same = (k: Cheer, receiverId: string, cheerType: CheerType) =>
  k.receiver_id === receiverId && k.cheer_type === cheerType

export async function fetchMyCheers(eventId: string, giverId: string): Promise<Cheer[]> {
  const { data, error } = await supabase.from('cheers').select(CHEER_SELECT).eq('event_id', eventId).eq('giver_id', giverId)
  if (error) throw error
  return (data ?? []) as Cheer[]
}

/**
 * The viewer's cheers for one event: what they've already given (cached under
 * `event:<id>:cheers:<userId>`, fetched only when `enabled` — i.e. the Cheers
 * tab is open on an ended event), what they've staged, and submit / revoke /
 * reset. Revoke and reset are optimistic with rollback.
 */
export function useEventCheers(eventId: string, userId: string | null, enabled: boolean) {
  const key = userId ? eventKeys.myCheers(eventId, userId) : null
  const given = useQuery(key, () => fetchMyCheers(eventId, userId as string), {
    staleMs: STALE.detail,
    enabled: enabled && !!userId,
  })
  const myCheersGiven = given.data ?? NO_CHEERS

  const [pendingCheers, setPendingCheers] = useState<PendingCheer[]>([])
  const [selectedCheerType, setSelectedCheerType] = useState<CheerType | null>(null)
  const [cheersSent, setCheersSent] = useState(false)
  const [cheerSubmitError, setCheerSubmitError] = useState<string | null>(null)
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (sentTimer.current) clearTimeout(sentTimer.current) }, [])

  /** Replace the cached list; returns the previous one for rollback. */
  const writeGiven = (fn: (prev: Cheer[]) => Cheer[]): Cheer[] => {
    const prev = (key && getQueryData<Cheer[]>(key)) || NO_CHEERS
    if (key) setQueryData<Cheer[]>(key, fn(prev))
    return prev
  }

  const revoke = useMutation(
    async (c: { receiverId: string; cheerType: CheerType }) => {
      const { error } = await supabase.from('cheers').delete()
        .eq('event_id', eventId).eq('giver_id', userId as string)
        .eq('receiver_id', c.receiverId).eq('cheer_type', c.cheerType)
      if (error) throw error
    },
    {
      onMutate: c => {
        const removed = myCheersGiven.find(k => same(k, c.receiverId, c.cheerType))
        writeGiven(prev => prev.filter(k => !same(k, c.receiverId, c.cheerType)))
        return () => { if (removed) writeGiven(prev => [...prev, removed]) }
      },
      onError: e => { toast.error("Couldn't save your cheers", e) },
    },
  )

  const submit = useMutation(
    async (rows: PendingCheer[]) => {
      if (!userId) throw new Error('Sign in to continue.')
      const { data, error } = await supabase
        .from('cheers')
        .insert(rows.map(p => ({ event_id: eventId, giver_id: userId, receiver_id: p.receiverId, cheer_type: p.cheerType })))
        .select(CHEER_SELECT)
      if (error) throw error
      return (data ?? []) as Cheer[]
    },
    {
      onMutate: () => { setCheerSubmitError(null) },
      onSuccess: inserted => {
        writeGiven(prev => [...prev, ...inserted])
        setPendingCheers([])
        setCheersSent(true)
        if (sentTimer.current) clearTimeout(sentTimer.current)
        sentTimer.current = setTimeout(() => setCheersSent(false), 3000)
      },
      onError: e => {
        reportEventError(eventId, userId, 'submitCheers', e)
        setCheerSubmitError(e.message)
      },
    },
  )

  const reset = useMutation(
    async () => {
      const { error } = await supabase.from('cheers').delete().eq('event_id', eventId).eq('giver_id', userId as string)
      if (error) throw error
    },
    {
      onMutate: () => {
        const snapshot = writeGiven(() => [])
        return () => { writeGiven(() => snapshot) }
      },
      onError: e => { toast.error("Couldn't save your cheers", e) },
    },
  )

  /** Toggle a cheer: pending → unstage; submitted → revoke; else → stage (up to the cap). */
  function toggleCheer(receiverId: string, cheerType: CheerType) {
    if (!userId) return
    const isPending = pendingCheers.some(p => p.receiverId === receiverId && p.cheerType === cheerType)
    if (isPending) {
      setPendingCheers(prev => prev.filter(p => !(p.receiverId === receiverId && p.cheerType === cheerType)))
    } else if (myCheersGiven.some(k => same(k, receiverId, cheerType))) {
      void revoke.mutate({ receiverId, cheerType })
    } else if (myCheersGiven.length + pendingCheers.length < CHEERS_MAX_PER_EVENT) {
      setPendingCheers(prev => [...prev, { receiverId, cheerType }])
    }
  }

  function submitCheers() {
    if (!userId || pendingCheers.length === 0) return
    void submit.mutate(pendingCheers)
  }

  function resetCheers() {
    if (!userId || (myCheersGiven.length === 0 && pendingCheers.length === 0)) return
    setPendingCheers([])
    if (myCheersGiven.length > 0) void reset.mutate(undefined)
  }

  /** Leaving the Cheers tab drops the staged picks and the open category. */
  const clearDraft = useCallback(() => {
    setSelectedCheerType(null)
    setPendingCheers([])
  }, [])

  return {
    cheersLoading: given.isLoading,
    myCheersGiven,
    pendingCheers,
    selectedCheerType,
    setSelectedCheerType,
    cheersSent,
    cheerSubmitError,
    submittingCheers: submit.isPending,
    toggleCheer,
    submitCheers,
    resetCheers,
    clearDraft,
  }
}

