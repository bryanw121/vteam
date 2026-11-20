import { useCallback, useMemo, useRef } from 'react'
import { Platform } from 'react-native'
import { Gesture } from 'react-native-gesture-handler'
import { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import type { DraggableCardCallbacks } from '../../types/people'

/**
 * The drag-and-pin gestures of one People-tab roster card (players and +1s,
 * #332): a pan that moves it between teams and a tap that pins it, both host
 * only. Web starts the drag on a 5px click-drag; native needs a 500 ms long
 * press first so the list still scrolls.
 *
 * Imports Reanimated and Gesture Handler, which on web may load only inside
 * the event screen's lazy chunk (#193): import this file directly from
 * components/event/people, never through hooks/event/index.ts.
 */
export function useDraggableCard(isOwner: boolean, callbacks: DraggableCardCallbacks) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)

  // The gesture closures are built once per isOwner; read the latest callbacks through a ref.
  const cbRef = useRef(callbacks)
  cbRef.current = callbacks
  const start = useCallback((x: number, y: number) => cbRef.current.onDragStart(x, y), [])
  const move = useCallback((x: number, y: number) => cbRef.current.onDragMove(x, y), [])
  const end = useCallback((x: number, y: number) => cbRef.current.onDragEnd(x, y), [])
  const cancel = useCallback(() => cbRef.current.onDragEnd(-1, -1), [])
  const togglePin = useCallback(() => cbRef.current.onTogglePin(), [])

  const panGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onStart((e) => {
        'worklet'
        scale.value = withSpring(1.06, { damping: 12 })
        opacity.value = withSpring(0.35)
        runOnJS(start)(e.absoluteX, e.absoluteY)
      })
      .onUpdate((e) => {
        'worklet'
        runOnJS(move)(e.absoluteX, e.absoluteY)
      })
      .onEnd((e) => {
        'worklet'
        scale.value = withSpring(1)
        opacity.value = withSpring(1)
        runOnJS(end)(e.absoluteX, e.absoluteY)
      })
      .onFinalize((_e, success) => {
        'worklet'
        scale.value = withSpring(1)
        opacity.value = withSpring(1)
        if (!success) runOnJS(cancel)()
      })
      .enabled(isOwner)
    return Platform.OS === 'web' ? pan.minDistance(5) : pan.activateAfterLongPress(500)
  }, [isOwner])

  const tapGesture = useMemo(() => Gesture.Tap()
    .onEnd(() => { 'worklet'; runOnJS(togglePin)() })
    .enabled(isOwner),
  [isOwner])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  return { panGesture, tapGesture, animStyle }
}
