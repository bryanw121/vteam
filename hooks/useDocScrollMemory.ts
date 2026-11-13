import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
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
 * `hideRef` (optional) is what stays hidden until the offset is back: by default
 * `nodeRef`, but a screen whose header sits above `nodeRef` passes its whole root,
 * or the header paints at the top for a frame before the jump (#254).
 * A no-op on native, without a key, or when `active` is false.
 */
export function useDocScrollMemory(
  key: string | undefined,
  active: boolean,
  nodeRef: React.RefObject<View | null>,
  onLayout?: (e: LayoutChangeEvent) => void,
  hideRef?: React.RefObject<View | null>,
): (e: LayoutChangeEvent) => void {
  const enabled = Platform.OS === 'web' && !!key && active
  const wasShown = useRef(false)
  // Until this screen's restore has finished, scroll events are not its
  // reader's: the browser's own history restoration, or our first clamped
  // scrollTo while the page is still short, would overwrite the remembered
  // offset with a smaller one (#193 made the remount fast enough to hit it).
  const restoring = useRef(true)
  const node = () => nodeRef.current as unknown as HTMLElement | null
  const hideNode = () => ((hideRef ?? nodeRef).current as unknown as HTMLElement | null)
  const docScrollOn = () => document.body.classList.contains('doc-scroll')

  useEffect(() => {
    if (!enabled || !key || typeof window === 'undefined') return
    const onWindowScroll = () => {
      if (!restoring.current && docScrollOn() && isShown(node())) rememberScroll(key, window.scrollY)
    }
    window.addEventListener('scroll', onWindowScroll, { passive: true })
    return () => window.removeEventListener('scroll', onWindowScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nodeRef is stable
  }, [enabled, key])

  // Coming back (Back remounts the screen): until the offset is put back, the content is
  // hidden, so it never paints at the top and then jumps there (the flicker). Document scroll
  // switches back on in an effect that runs after this one, so the restore itself can't happen
  // before the first paint. A timer always shows it again.
  const hiddenUntil = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reveal = () => {
    if (hiddenUntil.current) { clearTimeout(hiddenUntil.current); hiddenUntil.current = null }
    const el = hideNode()
    if (el?.style) el.style.visibility = ''
  }
  useLayoutEffect(() => {
    if (!enabled || !key || typeof window === 'undefined') return
    if (recallScroll(key) <= 0) return
    const el = hideNode()
    if (!el?.style) return
    el.style.visibility = 'hidden'
    hiddenUntil.current = setTimeout(reveal, 400)
    return reveal
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [])

  return useCallback((e: LayoutChangeEvent) => {
    onLayout?.(e)
    if (!enabled || !key) return
    const shown = e.nativeEvent.layout.height > 0
    const cameBack = shown && !wasShown.current
    wasShown.current = shown
    if (!shown) { restoring.current = true; return }
    if (!cameBack) return
    const y = recallScroll(key)
    if (y <= 0) { restoring.current = false; reveal(); return }
    restoreWhenReady({
      y,
      ready: () => docScrollOn() && isShown(node()),
      apply: to => window.scrollTo(0, to),
      current: () => window.scrollY,
      onDone: () => { restoring.current = false; reveal() },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nodeRef is stable
  }, [enabled, key, onLayout])
}
