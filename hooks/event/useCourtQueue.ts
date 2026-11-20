import { useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { getQueryData, queryKey, setQueryData, useFocusRefetch, useMutation, useQuery } from '../../lib/query'
import { useRealtimeChannel } from '../../lib/realtime'
import { toast } from '../../lib/toast'
import { track } from '../../lib/analytics'
import { STALE } from '../../constants/cache'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { COURT_QUEUE_COPY } from '../../constants/copy'
import { parseQueueState, ruleColumns, ruleFromColumns } from '../../utils/courtQueue'
import type { CourtQueue, CourtQueueRule, CourtQueueState } from '../../types'

/**
 * An event's court queue for open play (#333): read by anyone who can see the
 * event, kept live by realtime, saved by the host or a co-host through
 * save_court_queue(), which refuses a save that started from an older version
 * (another phone saved first: we show theirs).
 */

const COLUMNS = 'event_id, rule, stay_max, state, version, ended_at, updated_at'

type Row = { event_id: string; rule: string; stay_max: number | null; state: unknown; version: number; ended_at: string | null; updated_at: string }

export function courtQueueKey(eventId: string): string {
  return queryKey('court-queue', eventId)
}

/** A saved row as the app uses it; null when it isn't a readable queue. */
export function courtQueueFromRow(row: Row | null | undefined): CourtQueue | null {
  if (!row) return null
  const state = parseQueueState(row.state)
  if (!state) return null
  return {
    eventId: row.event_id,
    rule: ruleFromColumns(row.rule, row.stay_max),
    state,
    version: row.version,
    ended: row.ended_at !== null,
    updatedAt: row.updated_at,
  }
}

type SaveVars = { state: CourtQueueState; rule: CourtQueueRule; ended?: boolean; expected: number }

export function useCourtQueue(eventId: string | undefined, opts?: { enabled?: boolean }) {
  const enabled = (opts?.enabled ?? true) && !!eventId
  const key = eventId ? courtQueueKey(eventId) : null
  const { data, isLoading, error, refetch } = useQuery<CourtQueue | null>(
    key,
    async () => {
      const { data, error } = await supabase.from('event_court_queues').select(COLUMNS).eq('event_id', eventId as string).maybeSingle()
      if (error) throw error
      return courtQueueFromRow(data as Row | null)
    },
    { staleMs: STALE.courtQueue, enabled },
  )
  useFocusRefetch(key)

  const bindings = useMemo(() => (eventId ? [{
    event: '*' as const,
    table: 'event_court_queues',
    filter: `event_id=eq.${eventId}`,
    handler: (payload: { new?: Row; eventType?: string }) => {
      if (!key) return
      if (payload.eventType === 'DELETE') { setQueryData<CourtQueue | null>(key, null); return }
      const next = courtQueueFromRow(payload.new)
      // Our own save already put this version (or a newer one) in the cache.
      if (next) setQueryData<CourtQueue | null>(key, prev => (prev && prev.version >= next.version ? prev : next))
    },
  }] : []), [eventId, key])
  useRealtimeChannel(eventId ? `court-queue:${eventId}` : null, bindings, { enabled, onReconnect: () => { void refetch({ force: true }) } })

  const save = useMutation<SaveVars, CourtQueue | null>(
    async ({ state, rule, ended, expected }) => {
      const cols = ruleColumns(rule)
      const { data, error } = await supabase.rpc('save_court_queue', {
        p_event_id: eventId as string,
        p_courts: state.courts.length,
        p_rule: cols.rule,
        p_stay_max: cols.stay_max as number,
        p_state: state as unknown as never,
        p_expected: expected,
        p_ended: ended ?? false,
      })
      if (error) throw error
      return courtQueueFromRow(data as unknown as Row)
    },
    {
      onMutate: ({ state, rule, ended, expected }) => {
        if (!key) return undefined
        const before = getQueryData<CourtQueue | null>(key)
        setQueryData<CourtQueue | null>(key, {
          eventId: eventId as string, rule, state, ended: !!ended,
          version: expected + 1, updatedAt: new Date().toISOString(),
        })
        return () => setQueryData<CourtQueue | null>(key, before ?? null)
      },
      onSuccess: (saved) => {
        if (key && saved) setQueryData<CourtQueue | null>(key, saved)
      },
      onError: (e) => {
        const code = (e as { code?: string }).code
        if (code === 'PT409') {
          toast.show({ message: COURT_QUEUE_COPY.conflict, variant: 'info' })
        } else {
          toast.error(COURT_QUEUE_COPY.failed, e)
        }
        void refetch({ force: true })
      },
    },
  )

  const queue = data ?? null
  const apply = useCallback((state: CourtQueueState, rule: CourtQueueRule, extra?: { ended?: boolean; event?: 'start' | 'result' | 'end' }) => {
    // One save at a time (the buttons are disabled while one is out).
    if (save.isPending) return
    const expected = queue?.version ?? 0
    void save.mutate({ state, rule, ended: extra?.ended, expected })
    if (extra?.event === 'start') {
      const r = rule.kind === 'both_off' ? 'both_off' : rule.stayMax === null ? 'stay_always' : `stay_${rule.stayMax}`
      track(ANALYTICS_EVENTS.courtQueueStarted, { courts: state.courts.length, rule: r, teams: state.courts.flat().filter(Boolean).length + state.queue.length })
    } else if (extra?.event === 'result') {
      track(ANALYTICS_EVENTS.courtQueueResult, { courts: state.courts.length })
    } else if (extra?.event === 'end') {
      track(ANALYTICS_EVENTS.courtQueueEnded, { games: state.games.length })
    }
  }, [queue?.version, save])

  return { queue, isLoading, error, saving: save.isPending, apply, refetch }
}
