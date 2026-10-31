import { useCallback, useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import type { LayoutChangeEvent, View } from 'react-native'
import { isShown, recallScroll, rememberScroll, restoreWhenReady } from '../utils/scrollMemory'

/**
 * Scroll memory for a screen in document-scroll mode (narrow web, the window
 * scrolls). Records `window.scrollY` under `key` while the screen's root view
 * is shown and doc-scroll is on, and scrolls back there when the view mounts
 * (the browser's back remounts tab screens) or is shown again after being
 * hidden. Leaving doc-scroll scrolls the window to 0 (lib/docScroll); the
 * class check keeps that 0 from being recorded.
 *
 * Returns the `onLayout` to put on the screen's root view (`nodeRef`).
 * A no-op on native, without a key, or when `active` is false.
 */
export function useDocScrollMemory(
  key: string | undefined,
  active: boolean,
  nodeRef: React.RefObject<View | null>,
  onLayout?: (e: LayoutChangeEvent) => void,
): (e: LayoutChangeEvent) => void {
  const enabled = Platform.OS === 'web' && !!key && active
  const wasShown = useRef(false)
  const node = () => nodeRef.current as unknown as HTMLElement | null
  const docScrollOn = () => document.body.classList.contains('doc-scroll')

  useEffect(() => {
    if (!enabled || !key || typeof window === 'undefined') return
    const onWindowScroll = () => {
      if (docScrollOn() && isShown(node())) rememberScroll(key, window.scrollY)
    }
    window.addEventListener('scroll', onWindowScroll, { passive: true })
    return () => window.removeEventListener('scroll', onWindowScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nodeRef is stable
  }, [enabled, key])

  return useCallback((e: LayoutChangeEvent) => {
    onLayout?.(e)
    if (!enabled || !key) return
    const shown = e.nativeEvent.layout.height > 0
    const cameBack = shown && !wasShown.current
    wasShown.current = shown
    if (!cameBack) return
    const y = recallScroll(key)
    if (y <= 0) return
    restoreWhenReady({
      y,
      ready: () => docScrollOn() && isShown(node()),
      apply: to => window.scrollTo(0, to),
      current: () => window.scrollY,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nodeRef is stable
  }, [enabled, key, onLayout])
}
