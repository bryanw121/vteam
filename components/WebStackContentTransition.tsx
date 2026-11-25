import React from 'react'
import { Platform, View } from 'react-native'
import { Slot, usePathname } from 'expo-router'
import { theme } from '../constants'
import { useReducedMotion } from '../hooks/useReducedMotion'

/**
 * Web: native-stack uses instant show/hide. A keyed CSS fade-in (not Reanimated, which would
 * put it in the web entry chunk, #193) gives a short transition when
 * opening routes from the profile tab (and between subpages). Native uses the real stack animation.
 * The pages' header (with Back, on every surface) is the layout's ScreenHeader (#377).
 */
export function WebStackContentTransition() {
  const pathname = usePathname()
  const reducedMotion = useReducedMotion()

  if (Platform.OS !== 'web') {
    return <Slot />
  }

  return (
    <View key={pathname} style={[{ flex: 1, backgroundColor: theme.colors.background }, reducedMotion ? null : FADE_IN]}>
      <Slot />
    </View>
  )
}

/** 240 ms fade-in on mount (react-native-web keyframes); skipped under reduced motion. */
const FADE_IN = {
  animationKeyframes: [{ from: { opacity: 0 }, to: { opacity: 1 } }],
  animationDuration: '240ms',
  animationTimingFunction: 'ease-out',
} as object
