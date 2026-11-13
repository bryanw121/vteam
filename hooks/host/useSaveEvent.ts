/**
 * Saving the host form (#188 part 4): one `save_event` RPC writes the event
 * (one row per date on a create), its tags and, on an edit that opened spots,
 * the waitlist promotion, in one transaction. Either everything saved or
 * nothing did. Readers of the event, the feed, its club and the host's
 * templates are told afterwards.
 */
import { supabase } from '../../lib/supabase'
import { queryKey, useMutation } from '../../lib/query'
import { Sentry } from '../../lib/sentry'
import { eventColumns, eventDates } from '../../utils/hostForm'
import { cleanDate } from '../../utils'
import type { SaveEventInput } from '../../types'

/** The RPC's arguments for a save: pure, so tests check create, recurring create and edit. */
export function saveEventArgs(input: SaveEventInput) {
  const dates = input.editId ? [input.form.date] : eventDates(input.form, input.recurrence)
  return {
    p_edit_id: input.editId ?? null,
    p_event: eventColumns(input.form, input.clubId),
    p_dates: dates.map(cleanDate),
    p_tag_ids: input.tagIds,
  }
}

export async function saveEvent(input: SaveEventInput): Promise<string[]> {
  const args = saveEventArgs(input)
  if (args.p_dates.length === 0) throw new Error('save_event: no dates')
  // TEMPORARY cast: save_event isn't in types/database.ts until it is regenerated from live after merge.
  const { data, error } = await supabase.rpc('save_event' as never, args as never)
  if (error) throw error
  return (data ?? []) as unknown as string[]
}

export function useSaveEvent() {
  return useMutation<SaveEventInput, string[]>(saveEvent, {
    invalidates: (_input, ids) => [...ids.map(id => queryKey('event', id)), 'feed', 'club'],
    onError: e => Sentry.captureException(e),
  })
}
