/**
 * "What to bring" on the host form (#256, moved here by #188 part 4): the
 * drafts, the list saved on the event being edited (fills the section once,
 * unless the host already changed it), and the write after the event row.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Sentry } from '../../lib/sentry'
import { invalidate, useQuery } from '../../lib/query'
import { track } from '../../lib/analytics'
import { toast } from '../../lib/toast'
import { STALE } from '../../constants'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { eventKeys } from '../event/keys'
import { fetchBringList } from '../event/useEventBringList'
import { bringDraftsChanged, draftsFromItems, saveBringArgs } from '../../utils/bringList'
import type { BringItem, BringItemDraft } from '../../types'

export function useHostBringList(editId: string | null, userId: string | null) {
  const [drafts, setDrafts] = useState<BringItemDraft[]>([])
  const touchedRef = useRef(false)
  const savedRef = useRef<BringItemDraft[]>([])

  const change = useCallback((next: BringItemDraft[]) => {
    touchedRef.current = true
    setDrafts(next)
  }, [])

  const savedQuery = useQuery<BringItem[]>(
    editId ? eventKeys.bring(editId, userId ?? null) : null,
    () => fetchBringList(editId as string),
    { staleMs: STALE.detail, enabled: !!editId && !!userId },
  )
  useEffect(() => {
    const items = savedQuery.data
    if (!items || touchedRef.current) return
    const next = draftsFromItems(items, userId ?? null)
    savedRef.current = next
    setDrafts(next)
  }, [savedQuery.data, userId])

  /** Writes the list after the event row; a failure here says so but doesn't undo the event. */
  const save = useCallback(async (eventIds: string[], keepIds: boolean, surface: string | null): Promise<void> => {
    if (eventIds.length === 0) return
    try {
      for (const id of eventIds) {
        // TEMPORARY cast: save_event_bring_items isn't in types/database.ts until it is regenerated from live after merge (#256).
        const { error } = await supabase.rpc('save_event_bring_items' as never, saveBringArgs(id, drafts, keepIds) as never)
        if (error) throw error
        invalidate(eventKeys.root(id))
      }
      track(ANALYTICS_EVENTS.bringListSaved, { items: drafts.length, surface: surface ?? 'unknown' })
      touchedRef.current = false
    } catch (e) {
      Sentry.captureException(e)
      toast.error("Event saved, but What to bring wasn't", e)
    }
  }, [drafts])

  /** Whether an edit changed the saved list. */
  const changedSinceSaved = useCallback(() => bringDraftsChanged(savedRef.current, drafts), [drafts])

  const reset = useCallback(() => {
    setDrafts([])
    touchedRef.current = false
  }, [])

  return { drafts, change, save, changedSinceSaved, reset }
}
