import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { STALE } from '../constants/cache'
import { EVENT_CARD_LIST_SELECT_MINIMAL } from '../constants'
import { useSession } from '../contexts/session'
import type { EventHistoryKind, EventWithDetails } from '../types'

/** Past lists show the most recent 20. */
export const HISTORY_LIMIT = 20

export const eventHistoryKey = (kind: EventHistoryKind, userId: string | null) => queryKey('history', kind, userId)

/** The viewer's past events attended / hosted, or their upcoming hosted events (#185). */
export async function fetchEventHistory(kind: EventHistoryKind, userId: string): Promise<EventWithDetails[]> {
  const now = new Date().toISOString()
  const query = kind === 'attended'
    ? supabase
      .from('events')
      .select(`${EVENT_CARD_LIST_SELECT_MINIMAL}, event_attendees!inner(user_id, status)`)
      .eq('event_attendees.user_id', userId)
      .eq('event_attendees.status', 'attending')
      .lt('event_date', now)
      .order('event_date', { ascending: false })
      .limit(HISTORY_LIMIT)
    : kind === 'hosted-past'
      ? supabase
        .from('events')
        .select(EVENT_CARD_LIST_SELECT_MINIMAL)
        .eq('created_by', userId)
        .lt('event_date', now)
        .order('event_date', { ascending: false })
        .limit(HISTORY_LIMIT)
      : supabase
        .from('events')
        .select(EVENT_CARD_LIST_SELECT_MINIMAL)
        .eq('created_by', userId)
        .gte('event_date', now)
        .order('event_date', { ascending: true })
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as EventWithDetails[]
}

/** One list for the signed-in viewer; idle (no fetch) for guests or when `enabled` is false. */
export function useEventHistory(kind: EventHistoryKind, opts?: { enabled?: boolean }) {
  const { userId } = useSession()
  return useQuery(eventHistoryKey(kind, userId), () => fetchEventHistory(kind, userId as string), {
    staleMs: STALE.feed,
    enabled: !!userId && (opts?.enabled ?? true),
  })
}
