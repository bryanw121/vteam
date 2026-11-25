import { STALE } from '../../constants'
import { invalidate, queryKey, setQueryData, useMutation, useQuery } from '../../lib/query'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { postSoloTeamsArgs } from '../../utils/soloTeams'
import type { MakeTeamsData, SoloTeamDraft, TournamentTeamWithRoster } from '../../types'

/**
 * Make teams (#282) reads and writes on its own, not through `hooks/tournament/api`:
 * a module both tournament routes import moves into the web first load
 * (`__common`), and the tournament page's api and actions are large.
 */
const MAKE_TEAMS_TOURNAMENT = 'id, created_by, title, team_mode, team_size, team_pins'
const SOLO_SIGNUPS = `
  id, tournament_id, name, captain_user_id, status, is_locked, seed, is_approved, is_paid, created_at,
  tournament_team_members (
    id, team_id, user_id, is_captain, joined_at,
    profiles!tournament_team_members_user_id_fkey (id, username, first_name, last_name, avatar_url, skill_level, position)
  )
`

const makeTeamsKey = (id: string) => queryKey('tournament', id, 'make-teams')

async function fetchMakeTeams(id: string): Promise<MakeTeamsData> {
  const [t, signups] = await Promise.all([
    supabase.from('tournaments').select(MAKE_TEAMS_TOURNAMENT).eq('id', id).maybeSingle(),
    supabase.from('tournament_teams').select(SOLO_SIGNUPS).eq('tournament_id', id).eq('status', 'free_agent').order('created_at'),
  ])
  if (t.error) throw t.error
  if (signups.error) throw signups.error
  const teams = (signups.data ?? []).map(({ tournament_team_members, ...team }) => ({
    ...team, members: tournament_team_members ?? [],
  })) as TournamentTeamWithRoster[]
  return { tournament: t.data as MakeTeamsData['tournament'], signups: teams }
}

export function useMakeTeams(id: string) {
  const query = useQuery(makeTeamsKey(id), () => fetchMakeTeams(id), { staleMs: STALE.detail })

  /** The keep-together groups, saved on the tournament as they change. */
  const savePins = useMutation(
    async (pins: string[][]) => {
      const { data, error } = await supabase.from('tournaments').update({ team_pins: pins }).eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Your pins were not saved.')
      return pins
    },
    {
      onMutate: pins => {
        const prev = query.data
        if (prev?.tournament) setQueryData<MakeTeamsData>(makeTeamsKey(id), { ...prev, tournament: { ...prev.tournament, team_pins: pins } })
        return () => { if (prev) setQueryData(makeTeamsKey(id), prev) }
      },
      onError: e => toast.error("Couldn't save who stays together", e),
    },
  )

  /** The drawn teams replace the solo sign-ups, in one call. */
  const postTeams = useMutation(
    async (teams: SoloTeamDraft[]) => {
      const { data, error } = await supabase.rpc('post_solo_teams', postSoloTeamsArgs(id, teams))
      if (error) throw error
      return data ?? 0
    },
    {
      onSuccess: () => invalidate(queryKey('tournament', id)),
      onError: e => toast.error("Couldn't post the teams", e),
    },
  )

  return { query, savePins, postTeams }
}
