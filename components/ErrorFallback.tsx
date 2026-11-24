import React, { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from './ui/Text'
import { Button } from './Button'
import { shared, theme } from '../constants'
import { CRASH_COPY, UPDATE_COPY } from '../constants/copy'
import { Spinner } from './ui'
import { handleChunkError } from '../lib/staleBuild'
import { isChunkLoadError } from '../utils/staleBuild'
import type { ChunkErrorAction } from '../utils/staleBuild'
import { routes } from '../utils/routes'
import { noteCrash, prepareCrashReport, recoverFromCrash } from '../lib/crashRecovery'
import type { Href } from 'expo-router'

type Props = { resetError: () => void; error?: unknown }

/**
 * What SentryErrorBoundary shows after a render error (shared by the native and
 * web boundaries). Every way out first drops what was cached or saved on the
 * device, so a copy an older build saved can't throw again (#316). A second
 * crash within 30 s offers a reload and a bug report instead of Try again.
 */
export function ErrorFallback({ resetError, error }: Props) {
  // A screen's code that a deploy took away is not a crash (#359): move to the new build.
  const [chunk] = useState(() => isChunkLoadError(error))
  if (chunk) return <StaleBuildFallback resetError={resetError} />
  return <CrashFallback resetError={resetError} />
}

/**
 * A lazy screen's code failed to load (web only). While lib/staleBuild asks the
 * host which build it serves, and while the page reloads into it, the screen
 * says vteam is updating; offline, it says the screen couldn't load. Only a
 * missing file on the same build falls through to the crash screen.
 */
function StaleBuildFallback({ resetError }: { resetError: () => void }) {
  const [action, setAction] = useState<ChunkErrorAction | null>(null)
  useEffect(() => {
    let live = true
    void handleChunkError().then(a => { if (live) setAction(a) })
    return () => { live = false }
  }, [])

  if (action === 'crash') return <CrashFallback resetError={resetError} />
  if (action === 'offline') {
    return (
      <View style={shared.crashScreen} accessibilityLiveRegion="assertive" testID="screen-load-failed">
        <View style={shared.crashInner}>
          <View style={shared.crashIcon}>
            <Ionicons name="cloud-offline-outline" size={30} color={theme.colors.primaryText} />
          </View>
          <Text style={shared.crashTitle} accessibilityRole="header">{UPDATE_COPY.offlineTitle}</Text>
          <Text style={shared.crashBody}>{UPDATE_COPY.offlineBody}</Text>
          <Button label={UPDATE_COPY.retry} onPress={resetError} style={shared.crashButton} />
        </View>
      </View>
    )
  }
  return (
    <View style={shared.crashScreen} accessibilityLiveRegion="polite" testID="updating-vteam">
      <View style={shared.crashInner}>
        <Spinner label={UPDATE_COPY.updatingTitle} />
        <Text style={shared.crashTitle} accessibilityRole="header">{UPDATE_COPY.updatingTitle}</Text>
        <Text style={shared.crashBody}>{UPDATE_COPY.updatingBody}</Text>
      </View>
    </View>
  )
}

function CrashFallback({ resetError }: { resetError: () => void }) {
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
