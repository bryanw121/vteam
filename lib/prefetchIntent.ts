import { Platform } from 'react-native'

/**
 * Touchable props that start a screen's requests before the tap completes:
 * once a press has been held for PRESS_INTENT_MS and, on desktop web, after
 * the pointer rests on the target for HOVER_DELAY_MS. Shared by event cards
 * (hooks/event/prefetch) and profile links (hooks/useUserProfile).
 */
export const PRESS_INTENT_MS = 80
const HOVER_DELAY_MS = 150

let hoverTimer: ReturnType<typeof setTimeout> | null = null
let pressTimer: ReturnType<typeof setTimeout> | null = null

function cancelHover(): void {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = null
}

/**
 * A finger that lands on a target to scroll also presses in; the scroll (or
 * press-out) cancels the pending prefetch. Prefetching right at press-in made
 * every such scroll fetch rows for a page nobody opened.
 */
function cancelPress(): void {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = null
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.removeEventListener('scroll', cancelPress, true)
  }
}

/**
 * Props to spread on a touchable. `onMouseEnter`/`onMouseLeave` are forwarded
 * to the DOM by react-native-web; native gets the press pair only.
 */
export function intentPrefetchProps(prefetch: () => void): object {
  const onPressIn = () => {
    cancelHover()
    cancelPress()
    pressTimer = setTimeout(() => {
      cancelPress()
      prefetch()
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
        prefetch()
      }, HOVER_DELAY_MS)
    },
    onMouseLeave: cancelHover,
  }
}
