import { Platform } from 'react-native'
import { prefetchQuery } from '../../lib/query'
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

const HOVER_DELAY_MS = 150
let hoverTimer: ReturnType<typeof setTimeout> | null = null

function cancelHover(): void {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = null
}

/**
 * How long a press must stay down before it counts as intent to open the card.
 * A finger that lands on a card to scroll the feed also presses in; the
 * scroll (or press-out) cancels the pending prefetch. Prefetching right at
 * press-in made every such scroll fetch four rows for a page nobody opened.
 */
export const PRESS_INTENT_MS = 80
let pressTimer: ReturnType<typeof setTimeout> | null = null

function cancelPress(): void {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = null
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.removeEventListener('scroll', cancelPress, true)
  }
}

/**
 * Props to spread on a feed card's touchable. `onMouseEnter`/`onMouseLeave`
 * are forwarded to the DOM by react-native-web; native gets the press pair only.
 */
export function eventPrefetchProps(id: string): object {
  const onPressIn = () => {
    cancelHover()
    cancelPress()
    pressTimer = setTimeout(() => {
      cancelPress()
      prefetchEventDetail(id)
    }, PRESS_INTENT_MS)
    // react-native-web keeps a press alive while a slow drag scrolls the page,
    // so any scroll (the page or an inner scroll view; capture sees both) ends
    // the intent too. Native ScrollViews end the press themselves (press-out).
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('scroll', cancelPress, { capture: true, passive: true })
    }
  }
  // Release, or the scroll view / page taking the touch over. A tap shorter
  // than PRESS_INTENT_MS loses the head start; the page then loads as it did
  // before prefetching (on desktop the hover has usually warmed it already).
  const onPressOut = cancelPress
  if (Platform.OS !== 'web') return { onPressIn, onPressOut }
  return {
    onPressIn,
    onPressOut,
    onMouseEnter: () => {
      cancelHover()
      hoverTimer = setTimeout(() => {
        hoverTimer = null
        prefetchEventDetail(id)
      }, HOVER_DELAY_MS)
    },
    onMouseLeave: cancelHover,
  }
}
