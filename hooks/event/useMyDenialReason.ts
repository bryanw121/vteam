import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/query'
import { STALE } from '../../constants'
import { eventKeys } from './keys'

export async function fetchMyDenialReason(eventId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('event_attendee_denials')
    .select('reason')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.reason ?? null
}

/**
 * The host's reason for denying the viewer's join request. Reasons live in
 * `event_attendee_denials`, readable only by that attendee and the event's
 * host and co-hosts (never on the public roster rows). Fetched only once the
 * roster shows the viewer as denied.
 */
export function useMyDenialReason(eventId: string, userId: string | null, isDenied: boolean): string | null {
  const { data } = useQuery(
    userId ? eventKeys.myDenial(eventId, userId) : null,
    () => fetchMyDenialReason(eventId, userId as string),
    { staleMs: STALE.detail, enabled: isDenied && !!userId },
  )
  return data ?? null
}
