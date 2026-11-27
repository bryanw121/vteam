import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { STALE } from '../constants'
import { alsoOn, alsoOnNeedsRead, mergeAlsoOn } from '../utils/outsideSession'
import { readAlsoOnRows } from '../utils/alsoOnQuery'
import { useToday } from './useToday'
import type { ExternalSession } from '../types'

/**
 * The outside session sheet's "Also on" (#348, #421): later dates of the same session. From the
 * loaded feed when it has enough; otherwise one read of the source's later sessions (anon SELECT,
 * the feed's own filters), so phones in the last week of a month still list next month's dates.
 */
export function useAlsoOn(session: ExternalSession | null, loaded: readonly ExternalSession[]): ExternalSession[] {
  const today = useToday()
  const fromFeed = useMemo(() => (session ? alsoOn(session, loaded) : []), [session, loaded])
  const needsRead = !!session && alsoOnNeedsRead(fromFeed.length)
  const { data } = useQuery<ExternalSession[]>(
    needsRead && session ? queryKey('outsideAlsoOn', session.id) : null,
    () => (session ? readAlsoOnRows(supabase, session, Date.now()) : Promise.resolve([])),
    { staleMs: STALE.feed },
  )
  return useMemo(
    () => (session && data ? mergeAlsoOn(session, loaded, data, today) : fromFeed),
    [session, loaded, data, today, fromFeed],
  )
}
