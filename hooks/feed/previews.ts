import { getQueryData, setQueryData, subscribeQueryCache } from '../../lib/query'
import { fetchEventCardPreviews, withEventCardPreviews } from '../../utils/eventCardPreviews'
import { feedState } from './state'
import type { EventCardPreviews, EventWithDetails } from '../../types'

/**
 * Phase two of the paint: fetch avatar previews for the events just fetched and
 * merge them into each month — but only into a month whose cached value is
 * still exactly the array this fetch produced. Any other change to that key
 * (a newer fetch, `invalidate`, an optimistic RSVP, `removeQueries`) means the
 * merge would overwrite newer state or clear a stale flag, so it is skipped;
 * the newer fetch brings its own previews.
 */
export function hydratePreviewsWhenLanded(buckets: Map<string, EventWithDetails[]>): void {
  const isClubEvent = (e: EventWithDetails) => !e._isTournament && !e._external
  // Only months with a club event have avatars to add.
  const pending = new Map([...buckets].filter(([, bucket]) => bucket.some(isClubEvent)))
  const ids = [...pending.values()].flat().filter(isClubEvent).map(e => e.id)
  if (ids.length === 0) return

  const landed = new Set<string>()
  let previews: EventCardPreviews | null = null
  let writing = false
  let done = false

  const finish = () => {
    if (done) return
    done = true
    unsubscribe()
    clearTimeout(giveUp)
  }

  const mergeLanded = () => {
    if (done || !previews) return
    const p = previews
    pending.forEach((bucket, key) => {
      if (!landed.has(key)) return
      pending.delete(key)
      writing = true
      try {
        setQueryData<EventWithDetails[]>(key, withEventCardPreviews(bucket, p))
      } finally {
        writing = false
      }
    })
    if (pending.size === 0) finish()
  }

  const unsubscribe = subscribeQueryCache(key => {
    if (writing) return
    const bucket = pending.get(key)
    if (!bucket) return
    if (!landed.has(key) && getQueryData(key) === bucket) {
      landed.add(key)
      if (previews) queueMicrotask(mergeLanded)
      return
    }
    pending.delete(key)
    landed.delete(key)
    if (pending.size === 0) finish()
  })
  // A superseded write that never lands and is never followed by a notify
  // (its entry was deleted outright) would otherwise leave this listener behind.
  const giveUp = setTimeout(finish, 60_000)

  void fetchEventCardPreviews(ids).then(result => {
    for (const id of ids) feedState.lastPreviews.set(id, result.get(id) ?? [])
    previews = result
    mergeLanded()
  })
}
