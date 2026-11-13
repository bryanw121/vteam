import { useEffect, useState } from 'react'
import { Platform, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from './ui/Text'
import { SERVER_DOWN_COPY } from '../constants/copy'
import { theme } from '../constants/theme'
import { nextProbeTime, probeNow, useServerHealth } from '../lib/serverHealth'

/** Room for the phone tab bar and the create button (and an event's join footer) below it. */
const BOTTOM_CLEARANCE = 96

/**
 * One calm line while vteam's server (or the device's connection) is down
 * (#289), and when the next try is (what's on screen is the last saved copy).
 * Retry probes at once. Floats above the bottom bar on every screen, like a
 * snackbar, so it never covers a header or a Back button; mounted once in
 * `app/(app)/_layout.tsx`. Hidden while the server answers.
 */
export function ServerStatusBar() {
  const health = useServerHealth()
  const insets = useSafeAreaInsets()
  const [, setTick] = useState(0)
  const down = health.status === 'down'

  // Re-render every second for the countdown; the time itself is read fresh below.
  useEffect(() => {
    if (!down) return
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [down])

  if (!down) return null
  const offline = health.cause === 'network'
  const next = nextProbeTime()
  const seconds = next ? Math.max(0, Math.ceil((next - Date.now()) / 1000)) : null
  const retry = seconds !== null && seconds > 0 ? SERVER_DOWN_COPY.retrying(seconds) : SERVER_DOWN_COPY.trying
  const body = offline ? `${SERVER_DOWN_COPY.offlineBody} · ${retry}` : retry

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
        left: theme.spacing.md,
        right: theme.spacing.md,
        bottom: insets.bottom + BOTTOM_CLEARANCE,
        alignItems: 'center',
        zIndex: 9000,
      }}
    >
      <View
        role="status"
        aria-live="polite"
        accessibilityLiveRegion="polite"
        testID="server-status-bar"
        style={{
          width: '100%',
          maxWidth: 520,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingLeft: theme.spacing.md,
          paddingRight: theme.spacing.xs,
          paddingVertical: theme.spacing.xs,
          minHeight: 52,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.warning,
          backgroundColor: theme.colors.toastWarningBg,
          ...Platform.select({
            ios: { shadowColor: theme.colors.black, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
            android: { elevation: 6 },
            web: { boxShadow: '0 6px 20px rgba(0,0,0,0.35)' } as object,
          }),
        }}
      >
        <Ionicons name={offline ? 'cloud-offline-outline' : 'warning-outline'} size={20} color={theme.colors.warning} aria-hidden />
        <View style={{ flex: 1, paddingVertical: theme.spacing.xs }}>
          <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
            {offline ? SERVER_DOWN_COPY.barOffline : SERVER_DOWN_COPY.barTitle}
          </Text>
          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtextStrong, lineHeight: theme.font.lineHeight.tight }}>{body}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { void probeNow() }}
          accessibilityRole="button"
          accessibilityLabel={`${SERVER_DOWN_COPY.retry} now`}
          testID="server-status-retry"
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.sm }}
        >
          <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.warning }}>{SERVER_DOWN_COPY.retry}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
