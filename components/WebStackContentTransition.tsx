import React from 'react'
import { Platform, TouchableOpacity, View, useWindowDimensions, StyleSheet } from 'react-native'
import { Text } from './ui/Text'
import { Slot, usePathname, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { BREAKPOINTS, theme } from '../constants'
import { routes, type RouteString } from '../utils/routes'
import { useReducedMotion } from '../hooks/useReducedMotion'

/** Every subpage that shows this back row lives under the Profile tab. */
function getBackPath(_pathname: string): RouteString {
  return routes.profile()
}

/**
 * Web: native-stack uses instant show/hide. A keyed CSS fade-in (not Reanimated, which would
 * put it in the web entry chunk, #193) gives a short transition when
 * opening routes from the profile tab (and between subpages). Native uses the real stack animation.
 *
 * On desktop web (≥ BREAKPOINTS.sidebar) the tab navigator has headerShown:false, so we render an
 * inline back row here so subpages always have a way to navigate back.
 */
export function WebStackContentTransition() {
  const pathname = usePathname()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const reducedMotion = useReducedMotion()
  const isDesktopWeb = Platform.OS === 'web' && width >= BREAKPOINTS.sidebar

  if (Platform.OS !== 'web') {
    return <Slot />
  }

  return (
    <View key={pathname} style={[{ flex: 1, backgroundColor: theme.colors.background }, reducedMotion ? null : FADE_IN]}>
      {isDesktopWeb && (
        <View style={styles.backRow}>
          <TouchableOpacity
            onPress={() => router.replace(getBackPath(pathname))}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
        </View>
      )}
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

const styles = StyleSheet.create({
  backRow: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
    backgroundColor: theme.colors.background,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontSize: theme.font.size.md,
    color: theme.colors.primaryText,
    fontWeight: theme.font.weight.medium,
  },
})
