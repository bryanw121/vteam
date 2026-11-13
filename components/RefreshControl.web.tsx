import React, { useEffect, useRef } from 'react'
import { View } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { shared, theme } from '../constants'
import { IDLE, PULL_TRIGGER, pullEnd, pullMove, pullStart, type PullState } from '../lib/pullGesture'
import { Spinner } from './ui/Spinner'
import type { ViewInstance } from 'react-native'

type Props = RefreshControlProps & { children?: React.ReactNode }

/** Where the indicator rests while `refreshing`, and how far above the top it hides. */
const REST_Y = 16
const HIDDEN_Y = -48

type Bind = {
  /** Element whose touches start a pull (the scroll view wrapper, or `document`). */
  target: HTMLElement | Document
  /** Scroll owners between the finger and this element must be at offset 0. */
  boundary: HTMLElement | null
  indicator: () => HTMLElement | null
  /** Gate for listeners that outlive their screen (doc-scroll: hidden Pager tabs). */
  live: () => boolean
  refreshing: () => boolean | undefined
  onRefresh: () => void
}

function place(el: HTMLElement | null, y: number, opacity: number, animate: boolean) {
  if (!el) return
  el.style.transition = animate ? 'transform 200ms ease-out, opacity 200ms ease-out' : 'none'
  el.style.transform = `translateY(${y}px)`
  el.style.opacity = String(opacity)
}

/** Wires lib/pullGesture to touch events on `target`; returns the unbind. */
function bindPull({ target, boundary, indicator, live, refreshing, onRefresh }: Bind): () => void {
  let state: PullState = IDLE
  // Every scroll owner between the finger and the boundary, and the window
  // (doc-scroll mode on narrow web), must be at offset 0.
  const atTop = (from: EventTarget | null) => {
    if (window.scrollY > 0) return false
    for (let el = from as HTMLElement | null; el && el !== boundary; el = el.parentElement) {
      if (el.scrollTop > 0) return false
    }
    return true
  }
  const hide = () => { if (!refreshing()) place(indicator(), HIDDEN_Y, 0, true) }
  const onStart = (e: Event) => {
    const t = (e as TouchEvent).touches[0]
    state = refreshing() || !live() ? IDLE : pullStart(atTop(e.target), (e as TouchEvent).touches.length, t.clientX, t.clientY)
  }
  const onMove = (e: Event) => {
    if (state.phase === 'idle') return
    const te = e as TouchEvent
    const t = te.touches[0]
    const next = pullMove(state, te.touches.length, t?.clientX ?? 0, t?.clientY ?? 0)
    if (next.phase === 'pulling') {
      if (te.cancelable) te.preventDefault()
      place(indicator(), HIDDEN_Y + next.pull, Math.min(next.pull / PULL_TRIGGER, 1), false)
    } else if (state.phase === 'pulling') {
      place(indicator(), HIDDEN_Y, 0, true)
    }
    state = next
  }
  const onEnd = () => {
    const fire = pullEnd(state)
    state = IDLE
    if (fire) {
      place(indicator(), REST_Y, 1, true)
      onRefresh()
    } else {
      hide()
    }
  }
  const onCancel = () => { state = IDLE; hide() }

  target.addEventListener('touchstart', onStart, { passive: true })
  target.addEventListener('touchmove', onMove, { passive: false })
  target.addEventListener('touchend', onEnd)
  target.addEventListener('touchcancel', onCancel)
  return () => {
    target.removeEventListener('touchstart', onStart)
    target.removeEventListener('touchmove', onMove)
    target.removeEventListener('touchend', onEnd)
    target.removeEventListener('touchcancel', onCancel)
  }
}

/** Shared by both components: latest props in refs, indicator follows `refreshing`. */
function usePullRefs(refreshing: boolean | undefined, onRefresh: (() => void) | undefined) {
  const indicatorRef = useRef<ViewInstance>(null)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const refreshingRef = useRef(refreshing)
  refreshingRef.current = refreshing
  const indicatorEl = () => indicatorRef.current as unknown as HTMLElement | null
  useEffect(() => {
    place(indicatorEl(), refreshing ? REST_Y : HIDDEN_Y, refreshing ? 1 : 0, true)
  }, [refreshing])
  return { indicatorRef, indicatorEl, refreshingRef, onRefreshRef }
}

function Indicator({ indicatorRef, refreshing, tintColor, fixed }: {
  indicatorRef: React.RefObject<ViewInstance | null>
  refreshing: boolean | undefined
  tintColor: RefreshControlProps['tintColor']
  fixed?: boolean
}) {
  return (
    <View
      ref={indicatorRef}
      pointerEvents="none"
      testID="pull-to-refresh-indicator"
      accessibilityElementsHidden={!refreshing}
      style={[shared.pullIndicator, fixed && shared.pullIndicatorFixed, { opacity: 0, transform: [{ translateY: HIDDEN_Y }] }]}
    >
      <Spinner size="small" color={tintColor ?? theme.colors.primary} animating />
    </View>
  )
}

/**
 * Web pull-to-refresh (#35). react-native-web's ScrollView renders
 * `cloneElement(refreshControl, { style }, scrollView)`, so this wraps the
 * scroll view: it listens for touches bubbling up from it, runs
 * lib/pullGesture, and calls `onRefresh` on release past the threshold.
 *
 * The indicator is moved by writing its DOM style directly, never by React
 * state, so a pull doesn't re-render the (possibly long) list it wraps.
 */
export function RefreshControl({ refreshing, onRefresh, enabled = true, tintColor, style, children, ...rest }: Props) {
  const wrapperRef = useRef<ViewInstance>(null)
  const { indicatorRef, indicatorEl, refreshingRef, onRefreshRef } = usePullRefs(refreshing, onRefresh)

  useEffect(() => {
    const node = wrapperRef.current as unknown as HTMLElement | null
    if (!node || !enabled) return
    return bindPull({
      target: node, boundary: node, indicator: indicatorEl, live: () => true,
      refreshing: () => refreshingRef.current, onRefresh: () => onRefreshRef.current?.(),
    })
  }, [enabled])

  return (
    <View ref={wrapperRef} {...rest} style={[style, shared.pullWrapper]}>
      {children}
      <Indicator indicatorRef={indicatorRef} refreshing={refreshing} tintColor={tintColor} />
    </View>
  )
}

/**
 * Doc-scroll mode (narrow mobile web): the BODY scrolls and there is no
 * ScrollView to wrap, so this listens on the whole document and pins its
 * indicator to the top of the viewport. Only reacts while its own screen is
 * displayed (Pager keeps other tabs mounted). Rendered by `DocScrollView` from
 * its `refreshControl` prop, or directly by screens with a hand-rolled
 * doc-scroll branch.
 */
export function DocPullToRefresh({ refreshing, onRefresh, enabled = true, tintColor }: RefreshControlProps) {
  const anchorRef = useRef<ViewInstance>(null)
  const { indicatorRef, indicatorEl, refreshingRef, onRefreshRef } = usePullRefs(refreshing, onRefresh)

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return
    const anchor = () => anchorRef.current as unknown as HTMLElement | null
    return bindPull({
      target: document, boundary: document.body, indicator: indicatorEl,
      // Displayed and on screen: the Pager hides or slides away inactive tabs.
      live: () => {
        const r = anchor()?.getClientRects()[0]
        return !!r && r.right > 0 && r.left < window.innerWidth
      },
      refreshing: () => refreshingRef.current, onRefresh: () => onRefreshRef.current?.(),
    })
  }, [enabled])

  return (
    <View ref={anchorRef} pointerEvents="box-none" style={shared.pullAnchor}>
      <Indicator indicatorRef={indicatorRef} refreshing={refreshing} tintColor={tintColor} fixed />
    </View>
  )
}
