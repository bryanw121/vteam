import { supabase } from '../lib/supabase'
import { invalidate, queryKey, useFocusRefetch, useMutation, useQuery } from '../lib/query'
import { useSession } from '../contexts/session'
import { STALE } from '../constants/cache'
import { toast } from '../lib/toast'
import { track } from '../lib/analytics'
import { ANALYTICS_EVENTS } from '../constants/analytics'
import { draftColumns } from '../utils/freeAgents'
import type { FreeAgent, FreeAgentDraft } from '../types'

/** Find a team rows with each player's public profile (#304). */
export const FREE_AGENT_SELECT =
  'id, program_id, user_id, want, positions, note, program_title, expires_on, created_at, updated_at, profiles (id, username, first_name, last_name, avatar_url, skill_level, position)'

const PREFIX = 'free-agents'

/**
 * How many players are looking, per program, in one call for a whole list (numbers only, so
 * guests get them too). Ids are sorted so the same list shares a cache entry.
 */
export function useFreeAgentCounts(programIds: string[]): Map<string, number> | null {
  const ids = [...new Set(programIds)].sort()
  const key = queryKey(PREFIX, 'counts', ids.join(','))
  const q = useQuery(key, async () => {
    const { data, error } = await supabase.rpc('program_free_agent_counts', { p_ids: ids })
    if (error) throw error
    return (data ?? []) as { program_id: string; n: number }[]
  }, { staleMs: STALE.programs, enabled: ids.length > 0 })
  if (!q.data) return null
  return new Map(q.data.map(r => [r.program_id, r.n]))
}

/** Who is looking for a team for one program (signed in; RLS hides expired and silenced rows). */
export function useFreeAgents(programId: string) {
  const { userId } = useSession()
  const key = queryKey(PREFIX, 'list', programId, userId)
  const q = useQuery(key, async (): Promise<FreeAgent[]> => {
    const { data, error } = await supabase
      .from('program_free_agents')
      .select(FREE_AGENT_SELECT)
      .eq('program_id', programId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return (data ?? []) as unknown as FreeAgent[]
  }, { staleMs: STALE.programs, enabled: !!userId && !!programId })
  useFocusRefetch(userId ? key : null)
  return q
}

/** Put the viewer on a program's list, change their entry, or take them off. */
export function useFreeAgentActions(programId: string) {
  const { userId } = useSession()
  const save = useMutation<{ draft: FreeAgentDraft; id: string | null }, void>(
    async ({ draft, id }) => {
      if (!userId) throw new Error('Not signed in')
      const cols = draftColumns(draft)
      const { error } = id
        ? await supabase.from('program_free_agents').update(cols).eq('id', id)
        : await supabase.from('program_free_agents').insert({ ...cols, program_id: programId, user_id: userId })
      if (error) throw error
    },
    {
      onSuccess: (_, { draft, id }) => {
        if (!id) track(ANALYTICS_EVENTS.freeAgentListed, { want: draft.want })
        toast.show({ message: id ? 'Saved' : "You're on the list", variant: 'success' })
      },
      onError: error => { toast.error("Couldn't save", error) },
      invalidates: [PREFIX],
    },
  )
  const remove = useMutation<string, void>(
    async id => {
      const { error } = await supabase.from('program_free_agents').delete().eq('id', id)
      if (error) throw error
    },
    {
      onSuccess: () => toast.show({ message: "You're off the list", variant: 'info' }),
      onError: error => { toast.error("Couldn't remove you", error) },
      invalidates: [PREFIX],
    },
  )
  return { save, remove, refresh: () => invalidate(PREFIX) }
}
