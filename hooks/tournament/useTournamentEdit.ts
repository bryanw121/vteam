/**
 * Editing a tournament (#402): the saved tournament as a wizard draft, and the
 * players who will be told about the change. Reads the same cached rows as the
 * tournament page, plus its linked clubs (#401).
 */
import { useMemo } from 'react'
import { queryKey, useQuery } from '../../lib/query'
import { STALE } from '../../constants/cache'
import { draftFromTournament, tournamentPlayers } from '../../utils/tournamentDraft'
import { fetchTeams, fetchTournamentCore, tournamentKeys } from './api'
import { fetchTournamentClubIds } from './useTournamentDraft'
import type { TournamentDraft, TournamentPlayerOption } from '../../types'

export function useTournamentEdit(id: string | null, userId: string | null) {
  const core = useQuery(id ? tournamentKeys.core(id) : null, () => fetchTournamentCore(id as string), { staleMs: STALE.detail, enabled: !!id })
  const teams = useQuery(id ? tournamentKeys.teams(id) : null, () => fetchTeams(id as string), { staleMs: STALE.detail, enabled: !!id })
  const tournament = core.data?.tournament ?? null
  const clubIds = useQuery(
    id && core.data ? queryKey('tournament', id, 'clubs') : null,
    () => fetchTournamentClubIds(id as string, tournament?.club_id ?? null),
    { staleMs: STALE.detail, enabled: !!id && !!core.data },
  )

  const seed = useMemo<TournamentDraft | null>(
    () => (tournament && clubIds.data ? draftFromTournament(tournament, core.data?.rules ?? null, clubIds.data) : null),
    [tournament, core.data?.rules, clubIds.data],
  )
  const players = useMemo<TournamentPlayerOption[]>(() => tournamentPlayers(teams.data ?? [], userId), [teams.data, userId])

  return {
    editing: !!id,
    seed,
    players,
    loading: !!id && (core.isLoading || teams.isLoading || clubIds.isLoading || (!!tournament && !seed)),
    notFound: !!id && !!core.data && !tournament,
    notHost: !!tournament && !!userId && tournament.created_by !== userId,
    error: !!id && ((!!core.error && !core.data) || (!!teams.error && !teams.data)),
    retry: () => { void core.refetch({ force: true }); void teams.refetch({ force: true }) },
  }
}
