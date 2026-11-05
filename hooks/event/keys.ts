import { getQueryData, invalidate, queryKey, removeQueries, setQueryData } from '../../lib/query'
import { profileBriefKey } from '../useMyProfile'

/**
 * Cache keys for one event's detail data. Everything lives under
 * `event:<id>`, so `invalidate(eventKeys.root(id))` (what `/host` does after an
 * edit) refreshes all of it.
 *
 * `event:<id>` holds the EVENT_DETAIL_SELECT shape (full attendee rows with
 * profiles). Don't seed it with a feed/list row: those carry counts, not rows.
 */
export const eventKeys = {
  root: (id: string) => queryKey('event', id),
  comments: (id: string) => queryKey('event', id, 'comments'),
  guests: (id: string) => queryKey('event', id, 'guests'),
  cohosts: (id: string) => queryKey('event', id, 'cohosts'),
  myCheers: (id: string, userId: string | null) => queryKey('event', id, 'cheers', userId),
  /** "I've paid" flags the viewer may see (their own; everyone's for hosts). Per viewer: RLS decides the rows. */
  payments: (id: string, userId: string) => queryKey('event', id, 'payments', userId),
  /** The viewer's own `ProfileBrief` (optimistic join rows, Venmo note). Shared with chat. */
  viewerProfile: (userId: string) => profileBriefKey(userId),
}

/**
 * `setQueryData` only if the key already has data — an updater must never
 * turn "not loaded yet" into a cached `undefined` that reads as loaded.
 * Returns the previous value so callers can roll back.
 */
export function patchQuery<T>(key: string, fn: (prev: T) => T): T | undefined {
  const prev = getQueryData<T>(key)
  if (prev === undefined) return undefined
  setQueryData<T>(key, fn(prev))
  return prev
}

/**
 * After the event is deleted: drop every `event:<id>` entry (a cached copy
 * would otherwise reopen as a live event for the next 60s) and refresh the
 * lists that showed it.
 */
export function forgetDeletedEvent(id: string): void {
  removeQueries(eventKeys.root(id))
  invalidate('feed')
  invalidate('club')
}
