import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { STALE } from '../constants'
import { yearStartIso } from '../utils/recap'
import type { MyGameRecap } from '../types'

/**
 * "Your game" (#227) for a finished game the viewer played: points paid for it
 * (own `point_events` rows only), cheers received at it, and games played this
 * year. Three small reads in parallel, only when `enabled`.
 */
export function useMyGameRecap(eventId: string, userId: string | null, eventDate: string | null, enabled: boolean) {
  return useQuery<MyGameRecap>(
    enabled && userId && eventDate ? queryKey('event', eventId, 'recap', userId) : null,
    async () => {
      const [points, cheers, games] = await Promise.all([
        supabase.from('point_events').select('amount').eq('user_id', userId as string).eq('event_id', eventId),
        supabase.from('cheers').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('receiver_id', userId as string),
        supabase.from('event_attendees').select('event_id, events!inner(event_date)', { count: 'exact', head: true })
          .eq('user_id', userId as string).eq('status', 'attending')
          .gte('events.event_date', yearStartIso(eventDate as string)).lte('events.event_date', new Date().toISOString()),
      ])
      for (const r of [points, cheers, games]) if (r.error) throw r.error
      const paid = (points.data ?? []) as { amount: number }[]
      return {
        pointsPaid: paid.length ? paid.reduce((n, p) => n + p.amount, 0) : null,
        cheers: cheers.count ?? 0,
        gamesThisYear: Math.max(1, games.count ?? 0),
      }
    },
    { staleMs: STALE.detail },
  )
}
