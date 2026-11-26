/**
 * The tournament creation wizard's state (#325): the draft, the step, and the
 * clubs the creator can link it to (optional, #401). Pure rules live in utils/tournamentDraft.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { queryKey, useQuery } from '../../lib/query'
import { toast } from '../../lib/toast'
import { STALE } from '../../constants/cache'
import { TOURNAMENT_TOTAL_STEPS, newTournamentDraft, sortTournamentClubs, validateTournamentStep } from '../../utils/tournamentDraft'
import type { TournamentClubOption, TournamentDraft } from '../../types'

export const tournamentClubsKey = (userId: string | null) => queryKey('clubs', 'member', userId)

/** Clubs the player belongs to, the ones they run first: a tournament can be linked to any of them (#401). */
export async function fetchTournamentClubs(userId: string): Promise<TournamentClubOption[]> {
  const { data, error } = await supabase
    .from('club_members')
    .select('role, clubs (id, name)')
    .eq('user_id', userId)
  if (error) throw error
  const clubs = ((data ?? []) as { role: string | null; clubs: Pick<TournamentClubOption, 'id' | 'name'> | null }[])
    .filter(m => !!m.clubs)
    .map(m => ({ ...(m.clubs as Pick<TournamentClubOption, 'id' | 'name'>), role: m.role }))
  return sortTournamentClubs(clubs)
}

/** The clubs a tournament is linked to (#401); before that migration, its one club. */
export async function fetchTournamentClubIds(id: string, fallback: string | null): Promise<string[]> {
  const { data, error } = await supabase.from('tournament_clubs' as never).select('club_id').eq('tournament_id', id).order('created_at')
  if (error) return fallback ? [fallback] : []
  return ((data ?? []) as { club_id: string }[]).map(r => r.club_id)
}

/** `seed`: a saved tournament's draft when editing; it replaces the blank draft once. */
export function useTournamentDraft(userId: string | null, seed: TournamentDraft | null = null) {
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

  // Editing (#402): seed the draft once from the saved tournament.
  const seeded = useRef(false)
  useEffect(() => {
    if (!seed || seeded.current) return
    seeded.current = true
    setDraft(seed)
  }, [seed])

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
