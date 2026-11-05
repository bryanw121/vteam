import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Platform, Pressable, View, useWindowDimensions, type ViewStyle } from 'react-native'
import { Text } from '../ui/Text'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { shared } from '../../constants'
import { Button } from '../Button'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { TOUR_ARROW_SIZE, placeTourCard, scrimRects, spotlightRect, tourCardWidth } from '../../utils/tour'
import type { TourRect, TourStepDef } from '../../types'

type Props = {
  step: TourStepDef
  index: number
  count: number
  /** The target's window rect; null while the tour is moving to the next step (scrim only). */
  target: TourRect | null
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

/** Web: pin to the viewport (the narrow-web document scrolls under it). */
const ROOT_POSITION = Platform.select<ViewStyle>({ web: { position: 'fixed' as ViewStyle['position'] }, default: {} })

/**
 * The tour's overlay: a dimmed screen with a cutout around the target, and a
 * card (title, one sentence, Back / Next, Skip) whose arrow points at it. It
 * takes every touch, so nothing underneath fires mid-tour. Rendered by
 * TourProvider as an absolute layer, never a Modal.
 */
export function TourOverlay({ step, index, count, target, onNext, onBack, onSkip }: Props) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const [cardHeight, setCardHeight] = useState<number | null>(null)
  const cardRef = useRef<View>(null)
  const fade = useRef(new Animated.Value(0)).current
  const isLast = index === count - 1

  const viewport = { width, height }
  const spot = target ? spotlightRect(target, viewport) : null
  const cardWidth = tourCardWidth(width, insets)
  const position = spot && cardHeight != null
    ? placeTourCard({ spot, card: { width: cardWidth, height: cardHeight }, viewport, insets, placement: step.placement })
    : null
  const shown = !!position

  // Fade each step in (instant with reduce motion), then move focus to the card
  // so screen readers announce it and keyboard users can press Enter / arrows.
  useEffect(() => {
    if (!shown) { fade.setValue(0); return }
    if (reduceMotion) fade.setValue(1)
    else Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start()
    const node = cardRef.current
    if (!node) return
    if (Platform.OS === 'web') (node as unknown as { focus?: () => void }).focus?.()
    else AccessibilityInfo.sendAccessibilityEvent(node, 'focus')
  }, [shown, index, reduceMotion, fade])

  // Desktop web keyboard: Esc skips, arrows move, Enter on the card goes next
  // (Enter on a focused button is that button's own press).
  const handlers = useRef({ onNext, onBack, onSkip })
  handlers.current = { onNext, onBack, onSkip }
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      const onButton = !!(e.target as HTMLElement | null)?.closest?.('button,a,[role="button"],[role="link"]')
      if (e.key === 'Escape') handlers.current.onSkip()
      else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !onButton)) handlers.current.onNext()
      else if (e.key === 'ArrowLeft') handlers.current.onBack()
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const scrim = spot
    ? scrimRects(spot, viewport).map((r, i) => (
      <View key={i} style={[shared.tourScrim, { left: r.x, top: r.y, width: r.width, height: r.height }]} />
    ))
    : <View style={[shared.tourScrim, { left: 0, top: 0, width, height }]} />

  return (
    <View style={[shared.tourRoot, ROOT_POSITION]} testID="tour-overlay">
      {scrim}
      {spot && (
        <View
          pointerEvents="none"
          testID="tour-spotlight"
          style={[shared.tourRing, { left: spot.x, top: spot.y, width: spot.width, height: spot.height }]}
        />
      )}

      {/* Rendered (invisible) before the first measurement so its height is known. */}
      <Animated.View
        ref={cardRef}
        onLayout={e => setCardHeight(e.nativeEvent.layout.height)}
        focusable
        role="dialog"
        aria-modal
        aria-label={step.title}
        accessibilityViewIsModal
        testID="tour-card"
        style={[
          shared.tourCard,
          { width: cardWidth, left: position?.x ?? 0, top: position?.y ?? -10000, opacity: shown ? fade : 0 },
        ]}
      >
        {position && (
          <View
            pointerEvents="none"
            testID="tour-arrow"
            style={[
              shared.tourArrow,
              position.side === 'bottom' ? shared.tourArrowUp : shared.tourArrowDown,
              { left: position.arrowX - TOUR_ARROW_SIZE / 2 },
            ]}
          />
        )}

        <View style={shared.tourCardHeader}>
          <View style={shared.tourProgress} accessible accessibilityLabel={`Step ${index + 1} of ${count}`}>
            {Array.from({ length: count }, (_, i) => (
              <View key={i} style={[shared.tourDot, i === index && shared.tourDotActive]} />
            ))}
            <Text style={shared.tourStepCount}>{index + 1} of {count}</Text>
          </View>
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip tour"
            hitSlop={4}
            style={shared.tourSkip}
            testID="tour-skip"
          >
            <Text style={shared.tourSkipText}>Skip</Text>
          </Pressable>
        </View>

        <Text style={shared.tourTitle} accessibilityRole="header">{step.title}</Text>
        <Text style={shared.tourBody}>{step.body}</Text>

        <View style={shared.tourActions}>
          {index > 0 && (
            <Button label="Back" variant="secondary" size="touch" fullWidth={false} onPress={onBack} testID="tour-back" />
          )}
          <Button label={isLast ? 'Done' : 'Next'} size="touch" fullWidth={false} onPress={onNext} testID="tour-next" />
        </View>
      </Animated.View>
    </View>
  )
}
