import React, { useState } from 'react'
import { Platform, View } from 'react-native'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from './ui/Text'
import { Button } from './Button'
import { shared, theme } from '../constants'
import { CRASH_COPY } from '../constants/copy'
import { routes } from '../utils/routes'
import { noteCrash, prepareCrashReport, recoverFromCrash } from '../lib/crashRecovery'
import type { Href } from 'expo-router'

type Props = { resetError: () => void }

/**
 * What SentryErrorBoundary shows after a render error (shared by the native and
 * web boundaries). Every way out first drops what was cached or saved on the
 * device, so a copy an older build saved can't throw again (#316). A second
 * crash within 30 s offers a reload and a bug report instead of Try again.
 */
export function ErrorFallback({ resetError }: Props) {
  // Once per caught error: this screen mounts once for each one.
  const [again] = useState(() => noteCrash() >= 2)

  function leave(to: Href | null) {
    recoverFromCrash()
    if (Platform.OS === 'web' && typeof window !== 'undefined' && (again || to)) {
      // A fresh page is the cleanest start; the address carries where to go.
      window.location.assign(!to || to === routes.app() ? '/' : String(to))
      return
    }
    resetError()
    if (to) setTimeout(() => { try { router.replace(to) } catch { /* navigator not mounted */ } }, 0)
  }

  function report() {
    prepareCrashReport()
    leave(routes.feedback('bug'))
  }

  return (
    <View style={shared.crashScreen} accessibilityLiveRegion="assertive">
      <View style={shared.crashInner}>
        <View style={shared.crashIcon}>
          <Ionicons name="alert" size={30} color={theme.colors.primaryText} />
        </View>
        <Text style={shared.crashTitle} accessibilityRole="header">
          {again ? CRASH_COPY.againTitle : CRASH_COPY.title}
        </Text>
        <Text style={shared.crashBody}>{again ? CRASH_COPY.againBody : CRASH_COPY.body}</Text>
        {again ? (
          <>
            <Button label={CRASH_COPY.reload} onPress={() => leave(Platform.OS === 'web' ? null : routes.app())} style={shared.crashButton} />
            <Button label={CRASH_COPY.report} variant="secondary" onPress={report} style={shared.crashButton} />
          </>
        ) : (
          <>
            <Button label={CRASH_COPY.tryAgain} onPress={() => leave(null)} style={shared.crashButton} />
            <Button label={CRASH_COPY.goToEvents} variant="ghost" onPress={() => leave(routes.app())} style={shared.crashButton} />
          </>
        )}
      </View>
    </View>
  )
}
