import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { STALE } from '../../constants'
import { getQueryData, invalidate, useQueries } from '../../lib/query'
import { useSession } from '../../contexts/session'
import { startOfToday } from '../../utils'
import { enumerateMonths } from '../../utils/monthKeys'
import { isFeedItemOver } from '../../utils/feedItems'
import { MAX_FEED_MONTHS, feedMonthKey, feedState, resetFeed, withMonths } from './state'
import { __resetFeedFetch, fetchFeedMonth } from './fetch'
import { seedFromSnapshot } from './startup'
import type { EventWithDetails } from '../../types'

/**
 * The Events feed, on `lib/query`.
 *
 * - One cache entry per month: `queryKey('feed', 'month', '2026-10')` holds every
 *   feed item (club events, tournaments, other venues' sessions) dated in that
 *   local month, past ones included. The cache is module-level, so leaving the
 *   tab (desktop: unmount) and coming back paints instantly from cache.
 * - Fetches batch: every month fetcher called in the same tick joins one
 *   microtask-flushed queue and they share ONE span fetch: a single
 *   `get_feed_span` RPC returning events, tournaments, other venues' sessions
 *   and avatar previews together. That is what keeps "current month + 3" on
 *   desktop, `invalidate('feed')` after an RSVP, and pull-to-refresh at one
 *   request instead of one per month.
 * - Fallback while the RPC isn't deployed (or can't run): one range query per
 *   table, and a two-phase paint: a month's events land first (with the last
 *   avatar previews we had); previews arrive in a second round trip and are
 *   merged with `setQueryData` only if nothing touched that month in between.
 *
 * The hook reads every requested month at once with `useQueries` (#343:
 * before it, a fixed row of `MAX_FEED_MONTHS` `useQuery` slots).
 *
 * Pieces (#343): `state` (module state, keys), `startup` (device snapshot,
 * first-paint metric), `fetch` (batched span fetch; `fallback` without the
 * RPC), `previews` (second-phase
 * avatar merge), `useFeedRsvp` (join / leave from a card).
 */

seedFromSnapshot()

/** Test-only. */
export function __resetFeedState(): void {
  feedState.requestedMonths = []
  feedState.lastPreviews = new Map()
  feedState.owner = undefined
  __resetFeedFetch()
}

export function useMonthEvents() {
  const { userId, loading: sessionLoading } = useSession()
  const [months, setMonths] = useState<string[]>(() => feedState.requestedMonths)

  // One cache entry per requested month (feedMonthKey), read together.
  const keys = useMemo(() => months.map(feedMonthKey), [months])
  const slots = useQueries<EventWithDetails[]>(keys, (_key, i) => fetchFeedMonth(months[i]), { staleMs: STALE.feed })
  const slotsRef = useRef(slots)
  slotsRef.current = slots

  // RSVP state in cached months belongs to whoever was signed in when they were
  // fetched. The cache outlives this screen, so compare against the module-level
  // owner rather than a per-mount ref (sign out on Profile, come back to Events).
  // Ignored while the session is still restoring (userId is null then, not "guest").
  useEffect(() => {
    if (sessionLoading) return
    if (feedState.owner !== undefined && feedState.owner !== userId) resetFeed()
    feedState.owner = userId
  }, [userId, sessionLoading])

  const request = useCallback((add: string[]) => {
    const next = withMonths(feedState.requestedMonths, add)
    if (next === feedState.requestedMonths) return
    feedState.requestedMonths = next
    setMonths(next)
  }, [])

  /** Add `month` to the feed. `force`: refetch it even if fresh (after a create/edit). */
  const loadMonth = useCallback((month: string, force = false) => {
    request([month])
    if (force) invalidate(feedMonthKey(month))
  }, [request])

  const loadMonthSpan = useCallback((startMonth: string, endMonth: string, force = false) => {
    const span = enumerateMonths(startMonth, endMonth)
    request(span)
    if (force) span.forEach(m => invalidate(feedMonthKey(m)))
  }, [request])

  /** Refetch every loaded month now (pull-to-refresh). Resolves when they have all settled. */
  const refresh = useCallback(async () => {
    await Promise.all(slotsRef.current.map(s => s.refetch({ force: true })))
  }, [])

  /** Refetch only the months that are stale. Retry after an error, focus, foreground. */
  const refetchStale = useCallback(() => {
    slotsRef.current.forEach(s => { void s.refetch() })
  }, [])

  useFocusEffect(refetchStale)
  useEffect(() => {
    const sub = AppState.addEventListener('change', status => {
      if (status === 'active') refetchStale()
    })
    return () => sub.remove()
  }, [refetchStale])

  // Ended items leave the feed: re-checked every minute, so a session drops off once it's over
  // without a refetch. Items with no known end (tournaments) stay for the rest of their day.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // The same array while no month's data changed, so the memos below can depend on it.
  const monthDataRef = useRef<(EventWithDetails[] | undefined)[]>([])
  const nextMonthData = slots.map(s => s.data)
  const prevMonthData = monthDataRef.current
  if (prevMonthData.length !== nextMonthData.length || prevMonthData.some((d, i) => d !== nextMonthData[i])) {
    monthDataRef.current = nextMonthData
  }
  const monthData = monthDataRef.current
  // The minute tick only changes the list when an item actually ends; otherwise the previous
  // array is kept, so the feed doesn't re-render every minute.
  const lastEvents = useRef<EventWithDetails[] | null>(null)
  const events = useMemo(() => {
    const today = startOfToday()
    const list = monthData
      .flatMap(d => d ?? [])
      .filter(e => e.event_date >= today && !isFeedItemOver(e, nowMs))
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
    const prev = lastEvents.current
    if (prev && prev.length === list.length && prev.every((e, i) => e === list[i])) return prev
    lastEvents.current = list
    return list
  }, [monthData, nowMs])

  const loadedMonths = useMemo(
    () => months.filter((_, i) => monthData[i] !== undefined),
    [months, monthData],
  )
  const isMonthLoaded = useCallback((month: string) => getQueryData(feedMonthKey(month)) !== undefined, [])

  // True only while a requested month has nothing to show yet (including before
  // the screen's first loadMonth, so the first paint is a spinner, not "No
  // events"). Background refetches (`invalidate('feed')`, focus) don't count:
  // they must not flash the footer spinner or pause infinite scroll.
  const loading = months.length === 0 || slots.some(s => s.isLoading)
  const error = slots.find(s => s.error)?.error ?? null
  const lastData = months.length > 0 ? monthData[months.length - 1] : undefined
  const reachedEnd = months.length >= MAX_FEED_MONTHS || (lastData !== undefined && lastData.length === 0)

  return { events, loadMonth, loadMonthSpan, refresh, refetchStale, loading, error, isMonthLoaded, loadedMonths, reachedEnd }
}
