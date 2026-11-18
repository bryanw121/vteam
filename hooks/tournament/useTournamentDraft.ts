/**
 * The tournament creation wizard's state (#325): the draft, the step, and the
 * clubs the creator can attach it to. Pure rules live in utils/tournamentDraft.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { queryKey, useQuery } from '../../lib/query'
import { toast } from '../../lib/toast'
import { STALE } from '../../constants/cache'
import { TOURNAMENT_TOTAL_STEPS, newTournamentDraft, validateTournamentStep } from '../../utils/tournamentDraft'
import type { TournamentClubOption, TournamentDraft } from '../../types'

export const tournamentClubsKey = (userId: string | null) => queryKey('clubs', 'member', userId)

/** Clubs the player belongs to: a tournament is attached to one of them. */
export async function fetchTournamentClubs(userId: string): Promise<TournamentClubOption[]> {
  const { data, error } = await supabase
    .from('club_members')
    .select('clubs (id, name)')
    .eq('user_id', userId)
  if (error) throw error
  return ((data ?? []) as { clubs: TournamentClubOption | null }[])
    .map(m => m.clubs)
    .filter((c): c is TournamentClubOption => !!c)
}

export function useTournamentDraft(userId: string | null) {
  const [draft, setDraft] = useState<TournamentDraft>(newTournamentDraft)
  const [step, setStep] = useState(0)

  const clubsQuery = useQuery<TournamentClubOption[]>(
    userId ? tournamentClubsKey(userId) : null,
    () => fetchTournamentClubs(userId as string),
    { staleMs: STALE.feed, enabled: !!userId },
  )
  const clubs = clubsQuery.data ?? []

  const update = useCallback((patch: Partial<TournamentDraft>) => {
    setDraft(prev => ({ ...prev, ...patch }))
  }, [])

  // With exactly one club there is nothing to choose.
  const onlyClubId = clubs.length === 1 ? clubs[0].id : null
  useEffect(() => {
    if (onlyClubId) setDraft(prev => (prev.clubId ? prev : { ...prev, clubId: onlyClubId }))
  }, [onlyClubId])

  /** Next step, or a toast saying what's missing. */
  const goNext = useCallback(() => {
    const missing = validateTournamentStep(step, draft)
    if (missing) { toast.show({ title: 'Missing info', message: missing, variant: 'warning' }); return }
    setStep(s => Math.min(s + 1, TOURNAMENT_TOTAL_STEPS - 1))
  }, [draft, step])

  /** Previous step; false on the first step (the screen leaves). */
  const goBack = useCallback((): boolean => {
    if (step === 0) return false
    setStep(s => s - 1)
    return true
  }, [step])

  return {
    draft,
    update,
    step,
    isLastStep: step === TOURNAMENT_TOTAL_STEPS - 1,
    goNext,
    goBack,
    clubs,
    clubsLoading: clubsQuery.isLoading,
    clubsError: !!clubsQuery.error && !clubsQuery.data,
    retryClubs: () => { void clubsQuery.refetch({ force: true }) },
  }
}
