import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { queryKey, useQuery } from '../lib/query'
import { EXTERNAL_SESSION_SELECT, STALE } from '../constants'
import type { ExternalSession } from '../types'

/**
 * The outside session a `?session=<id>` link names (#348): from the loaded feed when it's
 * there, else one read by id (anon SELECT; a session outside the loaded months, a guest's
 * first visit). `missing` once the read found nothing, or found a past or cancelled one.
 */
export function useOutsideSession(id: string, loaded: readonly ExternalSession[]): { session: ExternalSession | null; loading: boolean; missing: boolean } {
  const fromFeed = useMemo(() => (id ? loaded.find(s => s.id === id) ?? null : null), [id, loaded])
  const { data, isLoading, error } = useQuery<ExternalSession | null>(
    id && !fromFeed ? queryKey('outsideSession', id) : null,
    async () => {
      const { data: row, error: e } = await supabase.from('external_sessions').select(EXTERNAL_SESSION_SELECT).eq('id', id).not('canceled', 'is', true).maybeSingle()
      if (e) throw e
      const found = row as ExternalSession | null
      return found && found.id === id ? found : null
    },
    { staleMs: STALE.detail },
  )
  if (!id) return { session: null, loading: false, missing: false }
  if (fromFeed) return { session: fromFeed, loading: false, missing: false }
  const usable = data && Date.parse(data.ends_at ?? data.starts_at) > Date.now() ? data : null
  const settled = !isLoading && (data !== undefined || !!error)
  return { session: usable, loading: !settled, missing: settled && !usable }
}
