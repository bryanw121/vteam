import React, { useCallback, useRef } from 'react'
import { Platform, ScrollView, ScrollViewProps, StyleProp, View, ViewStyle } from 'react-native'
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, RefreshControlProps } from 'react-native'
import { DocPullToRefresh } from './RefreshControl'
import { useDocScrollMemory } from '../hooks/useDocScrollMemory'
import { isShown, recallScroll, rememberScroll, restoreWhenReady } from '../utils/scrollMemory'
import type { WebScrollableRef } from '../types'

type Props = ScrollViewProps & {
  /**
   * When true (mobile web document-scroll mode), render a plain View so the
   * content flows in the document and the BODY scrolls — this is what lets
   * Safari/Chrome collapse their URL bars. When false, behave exactly like
   * a ScrollView (native + app-shell web).
   */
  docScroll: boolean
  /**
   * Web only: keep this screen's scroll position under this key and put it back
   * when the screen returns, e.g. 'tab:profile'. See utils/scrollMemory.
   */
  memoryKey?: string
  children?: React.ReactNode
}

/**
 * Web scroll memory (with `memoryKey`). Coming back to a screen on web used to
 * land at the top: the browser's back (and the iPhone swipe-back, which is the
 * same thing) remounts the tab screens, a screen under a pushed route or an
 * inactive tab is hidden with display:none (which zeroes scrollTop), and
 * leaving document-scroll mode scrolls the window to 0. The offset is kept in
 * a module-level map while the view is shown and restored when the view mounts
 * or is shown again. Document mode is `useDocScrollMemory`; ScrollView mode is
 * below. Native keeps offsets on its own, so none of this runs there.
 */
export function DocScrollView({ docScroll, memoryKey, children, style, contentContainerStyle, onScroll, onLayout, ...rest }: Props) {
  const remember = Platform.OS === 'web' && !!memoryKey
  const scrollRef = useRef<ScrollView>(null)
  const docRef = useRef<View>(null)
  const wasShown = useRef(false)
  const docLayout = useDocScrollMemory(memoryKey, docScroll, docRef, onLayout)

  const scrollNode = () => (scrollRef.current as unknown as WebScrollableRef)?.getScrollableNode?.() ?? null

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (remember && memoryKey && isShown(scrollNode())) rememberScroll(memoryKey, e.nativeEvent.contentOffset.y)
    onScroll?.(e)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [remember, memoryKey, onScroll])

  // Restore when the ScrollView first gets a size (mount, including the remount
  // after a browser back) and whenever it is shown again after being hidden.
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    onLayout?.(e)
    if (!remember || !memoryKey) return
    const shown = e.nativeEvent.layout.height > 0
    const cameBack = shown && !wasShown.current
    wasShown.current = shown
    const y = recallScroll(memoryKey)
    if (!cameBack || y <= 0) return
    restoreWhenReady({
      y,
      ready: () => isShown(scrollNode()),
      apply: to => scrollRef.current?.scrollTo({ y: to, animated: false }),
      current: () => scrollNode()?.scrollTop ?? y,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, [remember, memoryKey, onLayout])

  if (docScroll) {
    // No ScrollView to hang `refreshControl` on: the body scrolls, so pull-to-refresh
    // listens on the document instead (#35).
    const pull = React.isValidElement<RefreshControlProps>(rest.refreshControl) ? rest.refreshControl.props : null
    return (
      <View
        ref={docRef}
        onLayout={remember ? docLayout : onLayout}
        style={[style as StyleProp<ViewStyle>, contentContainerStyle as StyleProp<ViewStyle>, { flex: undefined } as ViewStyle]}
      >
        {pull && <DocPullToRefresh {...pull} />}
        {children}
      </View>
    )
  }
  return (
    <ScrollView
      ref={scrollRef}
      style={style}
      contentContainerStyle={contentContainerStyle}
      {...rest}
      onScroll={remember ? handleScroll : onScroll}
      onLayout={remember ? handleLayout : onLayout}
      scrollEventThrottle={remember ? rest.scrollEventThrottle ?? 16 : rest.scrollEventThrottle}
    >
      {children}
    </ScrollView>
  )
}
