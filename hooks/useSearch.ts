import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { STALE } from '../constants'
import { EVENT_CARD_LIST_SELECT, EVENT_CARD_MY_ATTENDANCE_SELECT } from '../constants/events'
import { useSession } from '../contexts/session'
import { attachEventCardPreviews } from '../utils/eventCardPreviews'
import { isSearchable, normalizeSearchQuery, orderByIds, parseSearchFeed } from '../utils/search'
import type { EventWithDetails, SearchResults, SearchScope } from '../types'

/** Wait this long after the last keystroke before searching. */
export const SEARCH_DEBOUNCE_MS = 250

/** `value`, once it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

async function fetchSearch(q: string, scope: SearchScope, region: string, userId: string | null): Promise<SearchResults> {
  const { data, error } = await supabase.rpc('search_feed', { q, scope, region })
  if (error) throw error
  const found = parseSearchFeed(data)
  let events: EventWithDetails[] = []
  if (found.events.length) {
    let query = supabase
      .from('events')
      .select(userId ? `${EVENT_CARD_LIST_SELECT}, ${EVENT_CARD_MY_ATTENDANCE_SELECT}` : EVENT_CARD_LIST_SELECT)
      .in('id', found.events)
    if (userId) query = query.eq('my_attendance.user_id', userId)
    const res = await query
    if (res.error) throw res.error
    // The select is chosen at runtime (with/without my_attendance), so PostgREST inference gives up.
    events = await attachEventCardPreviews(orderByIds((res.data ?? []) as unknown as EventWithDetails[], found.events))
  }
  return { events, external: found.external, hosts: found.hosts, clubs: found.clubs }
}

/**
 * Search (#176): games (vteam and other venues), hosts with upcoming games and
 * clubs for `q`, through `search_feed` (SECURITY INVOKER, so RLS decides what a
 * guest sees). Runs once `q` has settled for 250 ms and has 2+ characters.
 */
export function useSearch(rawQuery: string, scope: SearchScope, region: string) {
  const { userId } = useSession()
  const q = useDebounced(normalizeSearchQuery(rawQuery), SEARCH_DEBOUNCE_MS)
  const effectiveScope: SearchScope = userId ? scope : 'upcoming'
  const enabled = isSearchable(q)
  const query = useQuery(
    enabled ? queryKey('search', effectiveScope, region, userId ?? '_', q.toLowerCase()) : null,
    () => fetchSearch(q, effectiveScope, region, userId),
    { staleMs: STALE.feed },
  )
  return { ...query, q, enabled, settling: normalizeSearchQuery(rawQuery) !== q }
}
