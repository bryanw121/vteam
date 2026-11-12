import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { STALE } from '../constants/cache'
import { useSession } from '../contexts/session'
import type { CheerType, CheersSummary } from '../types'

export const cheersSummaryKey = (userId: string | null) => queryKey('cheersSummary', userId)

/** Cheers the player received (by type) and how many they gave (#185). */
export async function fetchCheersSummary(userId: string): Promise<CheersSummary> {
  const [receivedRes, givenRes] = await Promise.all([
    supabase.from('cheers').select('cheer_type').eq('receiver_id', userId),
    supabase.from('cheers').select('id', { count: 'exact', head: true }).eq('giver_id', userId),
  ])
  if (receivedRes.error) throw receivedRes.error
  if (givenRes.error) throw givenRes.error
  const rows = (receivedRes.data ?? []) as { cheer_type: CheerType }[]
  const counts: Partial<Record<CheerType, number>> = {}
  for (const row of rows) counts[row.cheer_type] = (counts[row.cheer_type] ?? 0) + 1
  return { totalReceived: rows.length, totalGiven: givenRes.count ?? 0, counts }
}

/** The signed-in viewer's cheers summary; idle for guests. */
export function useCheersSummary() {
  const { userId } = useSession()
  return useQuery(cheersSummaryKey(userId), () => fetchCheersSummary(userId as string), {
    staleMs: STALE.profile,
    enabled: !!userId,
  })
}
