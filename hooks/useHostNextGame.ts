import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { STALE } from '../constants'
import { EVENT_CARD_LIST_SELECT } from '../constants/events'
import { attachEventCardPreviews } from '../utils/eventCardPreviews'
import type { EventWithDetails } from '../types'

/** The host's soonest upcoming, uncancelled game (#227), for a finished game's page. Guests too. */
export function useHostNextGame(hostId: string | null, enabled: boolean) {
  return useQuery<EventWithDetails | null>(
    enabled && hostId ? queryKey('event', 'hostNext', hostId) : null,
    async () => {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_CARD_LIST_SELECT)
        .eq('created_by', hostId as string)
        .is('cancelled_at', null)
        .gt('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(1)
      if (error) throw error
      const rows = (data ?? []) as unknown as EventWithDetails[]
      return rows.length ? (await attachEventCardPreviews(rows))[0] : null
    },
    { staleMs: STALE.feed },
  )
}
