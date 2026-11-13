import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { Platform } from 'react-native'
import type { LayoutChangeEvent, View } from 'react-native'
import { isShown, recallScroll, rememberScroll, restoreWhenReady } from '../utils/scrollMemory'
import type { ViewInstance } from 'react-native'

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
  nodeRef: React.RefObject<ViewInstance | null>,
  onLayout?: (e: LayoutChangeEvent) => void,
  hideRef?: React.RefObject<ViewInstance | null>,
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

  const restore = () => {
    if (!key) return
    const y = recallScroll(key)
    if (y <= 0) { restoring.current = false; reveal(); return }
    restoreWhenReady({
      y,
      ready: () => docScrollOn() && isShown(node()),
      apply: to => window.scrollTo(0, to),
      current: () => window.scrollY,
      onDone: () => { restoring.current = false; reveal() },
    })
  }

  // The layout event can come before document scroll is switched on (the shell turns it
  // on a render later on Expo Router 58): restore when it does, if the view is already shown.
  const layoutHeight = useRef(0)
  useEffect(() => {
    if (!enabled || wasShown.current || layoutHeight.current <= 0) return
    wasShown.current = true
    restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore reads refs
  }, [enabled])

  return useCallback((e: LayoutChangeEvent) => {
    onLayout?.(e)
    layoutHeight.current = e.nativeEvent.layout.height
    if (!enabled || !key) return
    const shown = e.nativeEvent.layout.height > 0
    const cameBack = shown && !wasShown.current
    wasShown.current = shown
    if (!shown) { restoring.current = true; return }
    if (!cameBack) return
    restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nodeRef is stable
  }, [enabled, key, onLayout])
}

/**
 * For a tab screen that stays mounted under a pushed screen (Expo Router 58 keeps
 * the tabs mounted, so Back no longer remounts them): hide it when it loses focus,
 * and on focus again put the remembered offset back before showing it, so Back
 * never paints the top for a frame (#254). The first focus does nothing (the mount
 * path above handles it). Web, document scroll and a remembered offset only.
 */
export function useDocScrollRefocus(
  key: string,
  active: boolean,
  nodeRef: React.RefObject<ViewInstance | null>,
  hideRef: React.RefObject<ViewInstance | null>,
): void {
  const focusedOnce = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const el = () => hideRef.current as unknown as HTMLElement | null
    const show = () => { const n = el(); if (n?.style) n.style.visibility = '' }
    let timer: ReturnType<typeof setTimeout> | null = null
    if (focusedOnce.current) {
      const y = recallScroll(key)
      if (activeRef.current && y > 0 && Math.abs(window.scrollY - y) > 5) {
        timer = setTimeout(show, 400)
        restoreWhenReady({
          y,
          ready: () => document.body.classList.contains('doc-scroll') && isShown(nodeRef.current as unknown as HTMLElement | null),
          apply: to => window.scrollTo(0, to),
          current: () => window.scrollY,
          onDone: () => { if (timer) clearTimeout(timer); show() },
        })
      } else {
        show()
      }
    }
    focusedOnce.current = true
    return () => {
      if (timer) clearTimeout(timer)
      // Leaving for a pushed screen: hide now, while the offset is still remembered.
      const n = el()
      if (activeRef.current && recallScroll(key) > 0 && n?.style) n.style.visibility = 'hidden'
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [key]))
}
