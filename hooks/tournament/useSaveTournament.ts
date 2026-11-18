/**
 * Saving the tournament wizard (#325): one `save_tournament` RPC writes the
 * tournament and its rules in one transaction, so a failure leaves nothing
 * behind. Tournament lists are told afterwards.
 */
import { supabase } from '../../lib/supabase'
import { queryKey, useMutation } from '../../lib/query'
import { Sentry } from '../../lib/sentry'
import { toast } from '../../lib/toast'
import { saveTournamentArgs } from '../../utils/tournamentDraft'
import type { SaveTournamentInput } from '../../types'

export async function saveTournament({ draft, status }: SaveTournamentInput): Promise<string> {
  // Cast until types/database.ts is regenerated from live with save_tournament (applied when #325 merges).
  const { data, error } = await supabase.rpc('save_tournament' as never, saveTournamentArgs(draft, status) as never)
  if (error) throw error
  if (typeof data !== 'string') throw new Error('save_tournament returned no id')
  return data
}

export function useSaveTournament() {
  return useMutation<SaveTournamentInput, string>(saveTournament, {
    invalidates: [queryKey('tournaments')],
    onError: e => {
      Sentry.captureException(e)
      toast.error('Could not save tournament', e)
    },
  })
}
