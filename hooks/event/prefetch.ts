import { prefetchQuery } from '../../lib/query'
import { intentPrefetchProps } from '../../lib/prefetchIntent'
import { STALE } from '../../constants/cache'
import { eventKeys } from './keys'
import { fetchEventCohosts, fetchEventComments, fetchEventDetail, fetchEventGuests } from './useEventData'

/**
 * Start the event page's requests before the tap completes: once a press has
 * been held for PRESS_INTENT_MS and, on desktop web, after the pointer rests on
 * the card for HOVER_DELAY_MS. The detail screen's `useQuery`s then join the
 * in-flight requests or read the results. Each key is fetched only if not
 * already fresh, so repeated hovers cost nothing.
 */
export function prefetchEventDetail(id: string): void {
  const opts = { staleMs: STALE.detail }
  void prefetchQuery(eventKeys.root(id), () => fetchEventDetail(id), opts)
  void prefetchQuery(eventKeys.guests(id), () => fetchEventGuests(id), opts)
  void prefetchQuery(eventKeys.cohosts(id), () => fetchEventCohosts(id), opts)
  void prefetchQuery(eventKeys.comments(id), () => fetchEventComments(id), opts)
}

/** Re-exported for tests and callers that used it from here. */
export { PRESS_INTENT_MS } from '../../lib/prefetchIntent'

/** Props to spread on a feed card's touchable (see lib/prefetchIntent). */
export function eventPrefetchProps(id: string): object {
  return intentPrefetchProps(() => prefetchEventDetail(id))
}
