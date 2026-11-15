import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, PanResponder, Platform, View, type GestureResponderEvent, type ViewStyle } from 'react-native'
import type { PinchZoomProps } from '../../types'

const MIN = 1
const MAX = 4
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

type Touch = { pageX: number; pageY: number }
const touchesOf = (e: GestureResponderEvent): Touch[] => (e.nativeEvent.touches ?? []) as unknown as Touch[]
const distance = (t: Touch[]) => Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY)

/**
 * Pinch to zoom (1×–4×) and drag to move around while zoomed, for the scoresheet. Works the same on
 * phones, phone browsers and the native app: one finger still scrolls the page until the form is
 * zoomed in, and pinching back to full size snaps it back into place. `zoom` lets a button set the
 * zoom too (the Enlarge button). Transforms are animated values, so the form never re-renders while
 * a finger moves.
 */
export function PinchZoom({ zoom = 1, onZoomChange, children, testID }: PinchZoomProps) {
  const size = useRef({ w: 0, h: 0 })
  const now = useRef({ s: 1, x: 0, y: 0 })
  const start = useRef({ s: 1, x: 0, y: 0, dist: 0 })
  const anim = useMemo(() => ({ s: new Animated.Value(1), x: new Animated.Value(0), y: new Animated.Value(0) }), [])
  const [zoomed, setZoomed] = useState(false)

  const apply = (s: number, x: number, y: number) => {
    const maxX = (size.current.w * (s - 1)) / 2
    const maxY = (size.current.h * (s - 1)) / 2
    now.current = { s, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) }
    anim.s.setValue(now.current.s)
    anim.x.setValue(now.current.x)
    anim.y.setValue(now.current.y)
  }
  const settle = () => {
    if (now.current.s < 1.05) apply(1, 0, 0)
    const z = now.current.s > 1
    setZoomed(z)
    onZoomChange?.(now.current.s)
  }

  // The Enlarge button (or any outside change) sets the zoom.
  useEffect(() => {
    if (Math.abs(zoom - now.current.s) < 0.01) return
    apply(clamp(zoom, MIN, MAX), 0, 0)
    setZoomed(zoom > 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the requested zoom changes
  }, [zoom])

  const responder = useMemo(() => {
    const wants = (e: GestureResponderEvent, g: { dx: number; dy: number }) =>
      touchesOf(e).length >= 2 || (now.current.s > 1 && Math.abs(g.dx) + Math.abs(g.dy) > 4)
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: wants,
      // Take the gesture before the page's ScrollView does: a pinch, or a drag while zoomed.
      onMoveShouldSetPanResponderCapture: wants,
      onPanResponderGrant: e => {
        const t = touchesOf(e)
        start.current = { ...now.current, dist: t.length >= 2 ? distance(t) : 0 }
      },
      onPanResponderMove: (e, g) => {
        const t = touchesOf(e)
        if (t.length >= 2) {
          if (!start.current.dist) start.current = { ...now.current, dist: distance(t) }
          const s = clamp((start.current.s * distance(t)) / start.current.dist, MIN, MAX)
          apply(s, start.current.x + g.dx, start.current.y + g.dy)
        } else {
          if (start.current.dist) start.current = { ...now.current, dist: 0 }
          apply(now.current.s, start.current.x + g.dx, start.current.y + g.dy)
        }
      },
      onPanResponderRelease: settle,
      onPanResponderTerminate: settle,
      onPanResponderTerminationRequest: () => now.current.s <= 1,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and animated values are stable
  }, [])

  // In browsers: let the page scroll with one finger at full size, but keep the browser's own
  // pinch off this element so the pinch zooms the form, not the whole page.
  const webTouch = Platform.OS === 'web' ? ({ touchAction: zoomed ? 'none' : 'pan-x pan-y' } as unknown as ViewStyle) : null

  return (
    <View
      style={[{ overflow: 'hidden' }, webTouch]}
      onLayout={e => { size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height } }}
      testID={testID}
      {...responder.panHandlers}
    >
      <Animated.View style={{ transform: [{ translateX: anim.x }, { translateY: anim.y }, { scale: anim.s }] }}>
        {children}
      </Animated.View>
    </View>
  )
}
