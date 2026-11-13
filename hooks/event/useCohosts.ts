import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useMutation } from '../../lib/query'
import { COHOST_SELECT, GENERIC_ERROR_MESSAGE } from '../../constants'
import type { EventCohostWithProfile, Profile } from '../../types'
import { searchMembers } from '../../lib/memberSearch'
import { eventKeys, patchQuery } from './keys'
import { reportEventError } from './telemetry'
import type { EventData } from '../../types'
import { toast } from '../../lib/toast'

export const MAX_COHOSTS = 3

/**
 * Co-host management for the host: the "Manage Co-hosts" dialog's open state,
 * member search, add (insert returns the row with its profile) and remove.
 * Writes patch the cached `event:<id>:cohosts` list.
 */
export function useCohosts(data: EventData) {
  const { id, userId, event, cohosts } = data
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  /** Only the latest keystroke's response may write results. */
  const searchSeq = useRef(0)

  async function search(q: string) {
    setQuery(q)
    const trimmed = q.trim()
    const seq = ++searchSeq.current
    if (trimmed.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    const rows = await searchMembers(trimmed, { limit: 10, exclude: [userId, event?.created_by] }).catch(() => [])
    if (seq !== searchSeq.current) return
    const existing = new Set(cohosts.map(c => c.user_id))
    setResults(((rows ?? []) as Profile[]).filter(p => !existing.has(p.id)))
    setSearching(false)
  }

  function close() {
    searchSeq.current++
    setVisible(false)
    setQuery('')
    setResults([])
    setSearching(false)
  }

  const add = useMutation(
    async (candidate: Profile) => {
      if (!userId) throw new Error('Sign in to continue.')
      const { data: row, error } = await supabase
        .from('event_cohosts')
        .insert({ event_id: id, user_id: candidate.id, added_by: userId })
        .select(COHOST_SELECT)
        .single()
      if (error) throw error
      return row as EventCohostWithProfile
    },
    {
      onSuccess: (row, candidate) => {
        patchQuery<EventCohostWithProfile[]>(eventKeys.cohosts(id), rows => [...rows, row])
        setResults([])
        setQuery('')
        void supabase.from('notifications').insert({
          user_id: candidate.id,
          notification_type: 'cohost_added',
          title: 'You\'ve been added as a co-host',
          body: `You are now a co-host for "${event?.title}".`,
          data: { event_id: id },
        })
      },
      onError: e => {
        reportEventError(id, userId, 'addCohost', e)
        toast.error("Couldn't add the co-host", e)
      },
    },
  )

  const remove = useMutation(
    async (cohostUserId: string) => {
      const { error } = await supabase.from('event_cohosts').delete().eq('event_id', id).eq('user_id', cohostUserId)
      if (error) throw error
    },
    {
      onMutate: uid => { setRemovingId(uid) },
      onSuccess: (_r, uid) => {
        setRemovingId(null)
        patchQuery<EventCohostWithProfile[]>(eventKeys.cohosts(id), rows => rows.filter(c => c.user_id !== uid))
      },
      onError: e => {
        setRemovingId(null)
        reportEventError(id, userId, 'removeCohost', e)
        toast.error("Couldn't remove the co-host", e)
      },
    },
  )

  return {
    cohosts,
    visible,
    open: () => setVisible(true),
    close,
    query,
    search,
    results,
    searching,
    adding: add.isPending,
    add: (candidate: Profile) => {
      if (!event || cohosts.length >= MAX_COHOSTS) return
      void add.mutate(candidate)
    },
    removingId,
    remove: (cohostUserId: string) => { void remove.mutate(cohostUserId) },
  }
}

