import React, { useEffect, useRef, useState } from 'react'
import { View, Animated, PanResponder, Dimensions } from 'react-native'
import { SWIPE_NAVIGATION } from '../constants/navigation'

type Props = {
  page: number
  onPageChange: (index: number) => void
  children: React.ReactNode[]
  swipeEnabled?: boolean
  pagerBlockedRef?: React.MutableRefObject<boolean>
  /**
   * Render pages statically (no swipe, no horizontal translation): all pages
   * stay mounted, inactive ones are display:none. Used on mobile web where
   * document-scroll mode needs page content in normal document flow.
   */
  staticRender?: boolean
  /** With staticRender: let the active page size to its content (document-scroll mode) instead of flex:1 */
  autoHeight?: boolean
}

/**
 * Tab pager driven by the `page` prop (controlled).
 * Swiping between pages follows `SWIPE_NAVIGATION.tabs` (off since Oct 2026;
 * the gesture code below is kept so the flag can bring it back). Pass
 * swipeEnabled to override it for one pager.
 * Pass pagerBlockedRef to dynamically block swiping from specific inner areas.
 */
export function Pager({ page, onPageChange, children, swipeEnabled = SWIPE_NAVIGATION.tabs, pagerBlockedRef, staticRender = false, autoHeight = false }: Props) {
  if (staticRender) {
    return (
      <View style={autoHeight ? undefined : { flex: 1 }}>
        {(children as React.ReactNode[]).map((child, i) => (
          <View
            key={i}
            style={
              i !== page
                ? { display: 'none' }
                : autoHeight
                  ? undefined // auto height — content extends the document
                  : { flex: 1 }
            }
          >
            {child}
          </View>
        ))}
      </View>
    )
  }
  return <SwipePager page={page} onPageChange={onPageChange} swipeEnabled={swipeEnabled} pagerBlockedRef={pagerBlockedRef}>{children}</SwipePager>
}

function SwipePager({ page, onPageChange, children, swipeEnabled = SWIPE_NAVIGATION.tabs, pagerBlockedRef }: Omit<Props, 'staticRender' | 'autoHeight'>) {
  const count = (children as React.ReactNode[]).length
  const [containerWidth, setContainerWidth] = useState(Dimensions.get('window').width)
  const translateX = useRef(new Animated.Value(-page * containerWidth)).current
  const activePage = useRef(page)

  // Keep refs current so panResponder closures always see the latest values.
  const countRef = useRef(count)
  countRef.current = count

  const widthRef = useRef(containerWidth)
  widthRef.current = containerWidth

  const onPageChangeRef = useRef(onPageChange)
  onPageChangeRef.current = onPageChange

  const swipeEnabledRef = useRef(swipeEnabled)
  swipeEnabledRef.current = swipeEnabled

  const fallbackBlockedRef = useRef(false)
  const blockedRef = pagerBlockedRef ?? fallbackBlockedRef

  useEffect(() => {
    activePage.current = page
    Animated.spring(translateX, {
      toValue: -page * widthRef.current,
      useNativeDriver: true,
      tension: 60,
      friction: 11,
    }).start()
  }, [page])

  // snapTo lives in a ref so panResponder handlers always call the latest version.
  const snapToRef = useRef((target: number) => {})
  snapToRef.current = (target: number) => {
    const clamped = Math.max(0, Math.min(countRef.current - 1, target))
    activePage.current = clamped
    Animated.spring(translateX, {
      toValue: -clamped * widthRef.current,
      useNativeDriver: true,
      tension: 60,
      friction: 11,
    }).start()
    onPageChangeRef.current(clamped)
  }

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      swipeEnabledRef.current &&
      !blockedRef.current &&
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
    onPanResponderGrant: () => { translateX.stopAnimation() },
    onPanResponderMove: (_, { dx }) => {
      const w = widthRef.current
      const base = -activePage.current * w
      const atStart = activePage.current === 0 && dx > 0
      const atEnd   = activePage.current === countRef.current - 1 && dx < 0
      translateX.setValue(base + (atStart || atEnd ? dx * 0.2 : dx))
    },
    onPanResponderRelease: (_, { dx, vx }) => {
      const w = widthRef.current
      if      (dx < -w * 0.3 || vx < -0.5) snapToRef.current(activePage.current + 1)
      else if (dx >  w * 0.3 || vx >  0.5) snapToRef.current(activePage.current - 1)
      else                                   snapToRef.current(activePage.current)
    },
    onPanResponderTerminate: () => { snapToRef.current(activePage.current) },
  })).current

  return (
    <View
      style={{ flex: 1, overflow: 'hidden' }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width
        if (w > 0 && w !== widthRef.current) {
          widthRef.current = w
          setContainerWidth(w)
          translateX.setValue(-activePage.current * w)
        }
      }}
      {...panResponder.panHandlers}
    >
      <Animated.View style={{
        flex: 1,
        flexDirection: 'row',
        width: containerWidth * count,
        transform: [{ translateX }],
      }}>
        {(children as React.ReactNode[]).map((child, i) => (
          <View key={i} style={{ width: containerWidth, flex: 1 }}>
            {child}
          </View>
        ))}
      </Animated.View>
    </View>
  )
}
