import { useMemo } from 'react'
import { EXTERNAL_PROGRAM_MAX_AGE_MS, EXTERNAL_PROGRAM_SELECT } from '../constants'
import { STALE } from '../constants/cache'
import { queryKey, useFocusRefetch, useQuery } from '../lib/query'
import { supabase } from '../lib/supabase'
import { useToday } from './useToday'
import { useFeedRegion } from './useUserSettings'
import { programsForRegion } from '../utils/externalPrograms'
import type { ExternalProgram, ProgramsForRegion } from '../types'

export const externalProgramsKey = queryKey('external-programs')

/**
 * Leagues and tournaments run outside vteam, from Schelagg's programs feed (`external_programs`,
 * ingested every two hours; guests can read it). One small table for every region, read once and
 * grouped for the viewer's region. Rows Schelagg hasn't checked within EXTERNAL_PROGRAM_MAX_AGE_MS
 * are left out: a stopped ingest shows nothing rather than an old deadline or price.
 */
export function useExternalPrograms(): { data: ProgramsForRegion | null; isLoading: boolean; error: unknown; refetch: (o?: { force?: boolean }) => Promise<unknown> } {
  const region = useFeedRegion()
  const today = useToday()
  const q = useQuery(externalProgramsKey, async (): Promise<ExternalProgram[]> => {
    const since = new Date(Date.now() - EXTERNAL_PROGRAM_MAX_AGE_MS).toISOString()
    const { data, error } = await supabase
      .from('external_programs')
      .select(EXTERNAL_PROGRAM_SELECT)
      .gte('checked_at', since)
      .order('starts_on', { ascending: true })
      .limit(500)
    if (error) throw error
    return (data ?? []) as unknown as ExternalProgram[]
  }, { staleMs: STALE.programs })
  useFocusRefetch(externalProgramsKey)
  const data = useMemo(() => (q.data ? programsForRegion(q.data, region, today) : null), [q.data, region, today])
  return { data, isLoading: q.isLoading, error: q.error, refetch: q.refetch }
}
