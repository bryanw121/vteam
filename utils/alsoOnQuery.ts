import type { SupabaseClient } from '@supabase/supabase-js'
import { EXTERNAL_SESSION_MAX_AGE_MS, EXTERNAL_SESSION_SELECT } from '../constants/events'
import type { ExternalSession } from '../types'

/** How many later rows of the same source to read: a source lists several sessions a week. */
export const ALSO_ON_READ_LIMIT = 24

/**
 * The outside session sheet's own read for "Also on" (#421): the source's later sessions, with
 * the feed's filters (not cancelled, refreshed within EXTERNAL_SESSION_MAX_AGE_MS). One function
 * for the app (useAlsoOn) and the integration suite (e2e/integration/outsideSessions.int.spec.ts),
 * so the query the suite proves on beta is the one players run. No React Native here.
 */
export async function readAlsoOnRows(
  db: Pick<SupabaseClient, 'from'>,
  session: Pick<ExternalSession, 'source_id' | 'starts_at'>,
  nowMs: number,
): Promise<ExternalSession[]> {
  const since = new Date(nowMs - EXTERNAL_SESSION_MAX_AGE_MS).toISOString()
  const { data, error } = await db
    .from('external_sessions')
    .select(EXTERNAL_SESSION_SELECT)
    .eq('source_id', session.source_id)
    .gt('starts_at', session.starts_at)
    .eq('canceled', false)
    .gte('updated_at', since)
    .order('starts_at', { ascending: true })
    .limit(ALSO_ON_READ_LIMIT)
  if (error) throw error
  return (data ?? []) as ExternalSession[]
}
