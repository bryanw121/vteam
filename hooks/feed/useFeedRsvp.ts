import { useCallback, useRef, useState } from 'react'
import { EVENT_JUST_FILLED_BODY, EVENT_JUST_FILLED_TITLE } from '../../constants'
import { supabase } from '../../lib/supabase'
import { getQueryData, invalidate, setQueryData } from '../../lib/query'
import { toast } from '../../lib/toast'
import { eventKeys } from '../event/keys'
import { FEED_PREFIX, feedMonthKey, feedState } from './state'
import type { EventWithDetails, FeedRsvpResult, FeedRsvpVars } from '../../types'

// RSVP from a feed card.

/** Every cached month holding `eventId` (normally exactly one). */
function monthsHolding(eventId: string): Array<[string, EventWithDetails[]]> {
  const out: Array<[string, EventWithDetails[]]> = []
  for (const month of feedState.requestedMonths) {
    const key = feedMonthKey(month)
    const data = getQueryData<EventWithDetails[]>(key)
    if (data?.some(e => e.id === eventId)) out.push([key, data])
  }
  return out
}

/** `event` as `userId` would see it with `status` (null = no row). Keeps the attending count in step. */
export function withMyAttendance(
  event: EventWithDetails,
  userId: string,
  status: 'attending' | 'waitlisted' | null,
): EventWithDetails {
  const rows = event.my_attendance ?? []
  const wasAttending = rows.some(a => a.user_id === userId && (a.status ?? 'attending') === 'attending')
  const isAttending = status === 'attending'
  const count = Number(event.event_attendees_attending?.[0]?.count ?? 0)
  const nextCount = Math.max(0, count + (isAttending ? 1 : 0) - (wasAttending ? 1 : 0))
  return {
    ...event,
    my_attendance: [
      ...rows.filter(a => a.user_id !== userId),
      ...(status ? [{ user_id: userId, status }] : []),
    ],
    event_attendees_attending: [{ count: nextCount }],
  }
}

/**
 * Patch `eventId` in every cached month. The rollback restores only that
 * event's row, so undoing one card never reverts another card's RSVP that is
 * still in flight in the same month.
 */
function patchEvent(eventId: string, userId: string, status: 'attending' | 'waitlisted' | null): () => void {
  const snapshots = monthsHolding(eventId)
  const originals = new Map<string, EventWithDetails>()
  for (const [key, data] of snapshots) {
    const original = data.find(e => e.id === eventId)
    if (original) originals.set(key, original)
    setQueryData<EventWithDetails[]>(key, data.map(e => (e.id === eventId ? withMyAttendance(e, userId, status) : e)))
  }
  return () => {
    originals.forEach((original, key) => {
      setQueryData<EventWithDetails[]>(key, prev => (prev ?? []).map(e => (e.id === eventId ? original : e)))
    })
  }
}

async function writeRsvp({ eventId, action, userId }: FeedRsvpVars): Promise<FeedRsvpResult> {
  if (action === 'leave') {
    const { error } = await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', userId)
    if (error) throw error
    return { status: null }
  }
  // The database enforces capacity: if the last spot went to someone else first,
  // the insert is saved as 'waitlisted', so read back which status we actually got.
  const { data, error } = await supabase
    .from('event_attendees')
    .insert({ event_id: eventId, user_id: userId })
    .select('status')
    .single()
  if (error) throw error
  const status = (data as { status?: string } | null)?.status === 'waitlisted' ? 'waitlisted' : 'attending'
  // Correct the optimistic "Going" before `invalidates` refetches (a write after
  // that would cancel the refetch).
  if (status === 'waitlisted') patchEvent(eventId, userId, 'waitlisted')
  return { status }
}

/**
 * Join / leave from a feed card: optimistic `my_attendance` + attending count,
 * rolled back with an alert on error. One write per event at a time (a second
 * tap on the same card is ignored), but different cards can be in flight
 * together. On success the event's detail entry is invalidated so a recently
 * opened event page doesn't show a stale Join button; the feed is invalidated
 * once no card write is pending, so a refetch can't clobber another card's
 * optimistic state.
 */
export function useFeedRsvp() {
  const pendingRef = useRef(new Set<string>())
  const [pendingEventIds, setPendingEventIds] = useState<ReadonlySet<string>>(() => new Set())

  // Retry from the failure toast runs the same RSVP again.
  const rsvpRef = useRef<(vars: FeedRsvpVars) => Promise<void>>(async () => {})
  const rsvp = useCallback(async (vars: FeedRsvpVars) => {
    const { eventId, action, userId } = vars
    if (pendingRef.current.has(eventId)) return
    pendingRef.current.add(eventId)
    setPendingEventIds(new Set(pendingRef.current))

    const rollback = patchEvent(eventId, userId, action === 'join' ? 'attending' : null)
    try {
      const result = await writeRsvp(vars)
      invalidate(eventKeys.root(eventId))
      if (action === 'join' && result.status === 'waitlisted') toast.show({ title: EVENT_JUST_FILLED_TITLE, message: EVENT_JUST_FILLED_BODY, variant: 'warning' })
    } catch (e) {
      rollback()
      console.error('[useFeedRsvp]', e instanceof Error ? e.message : (e as { message?: string })?.message ?? e)
      toast.error(action === 'join' ? "Couldn't join" : "Couldn't leave", e, { label: 'Retry', onPress: () => { void rsvpRef.current(vars) } })
    } finally {
      pendingRef.current.delete(eventId)
      setPendingEventIds(new Set(pendingRef.current))
      if (pendingRef.current.size === 0) invalidate(FEED_PREFIX)
    }
  }, [])
  rsvpRef.current = rsvp

  const isPending = useCallback((eventId: string) => pendingEventIds.has(eventId), [pendingEventIds])

  return { rsvp, pendingEventIds, isPending }
}
