import { STALE } from '../constants/cache'
import { queryKey, useFocusRefetch, useQuery } from '../lib/query'
import { supabase } from '../lib/supabase'
import type { Tournament, TournamentListItem } from '../types'

const LIST_SELECT = 'id, title, location, start_date, status, format, club_id, max_teams, clubs(name), tournament_teams(count)'

/** How many tournaments the list reads (newest start dates first, then split client-side). */
const LIST_LIMIT = 200

export const tournamentListKey = (userId: string | null) => queryKey('tournaments', 'list', userId)

/**
 * Every tournament the viewer can see (RLS: published ones in their clubs, plus
 * their own drafts), with club name and registered team count. Guests see none,
 * so the query is skipped for them.
 */
export function useTournamentList(userId: string | null) {
  const key = tournamentListKey(userId)
  const q = useQuery(key, async (): Promise<TournamentListItem[]> => {
    const { data, error } = await supabase
      .from('tournaments')
      .select(LIST_SELECT)
      .eq('tournament_teams.status', 'registered')
      .order('start_date', { ascending: false })
      .limit(LIST_LIMIT)
    if (error) throw error
    return (data ?? []).map(({ clubs, tournament_teams, ...t }) => ({
      ...(t as Pick<Tournament, 'id' | 'title' | 'location' | 'start_date' | 'status' | 'format' | 'club_id' | 'max_teams'>),
      club_name: clubs?.name ?? null,
      team_count: tournament_teams?.[0]?.count ?? 0,
    }))
  }, { staleMs: STALE.feed, enabled: !!userId })
  useFocusRefetch(userId ? key : null)
  return q
}
