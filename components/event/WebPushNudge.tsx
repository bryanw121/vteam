import React, { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { shared, theme } from '../../constants'
import { WEB_PUSH_COPY, WEB_PUSH_NUDGE_ID } from '../../constants/copy'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { track } from '../../lib/analytics'
import { useSession } from '../../contexts/session'
import { markBannerSeenOnAccount, useUserSettings } from '../../hooks/useUserSettings'
import { loadSeenBanners, markBannerSeenOnDevice } from '../../utils/seenBanners'
import { enableWebPush, getWebPushState } from '../../utils/pushNotifications'
import type { WebPushState } from '../../types'

type Props = {
  /** iPhone Safari in a tab can't ask yet: this opens Settings → Notifications (the install steps). */
  onOpenSettings: () => void
}

/**
 * "Get a reminder before this game?" under You're going (#189): web only, signed
 * in, while push could still be turned on here (`ask`, or `needs-install` on an
 * iPhone). Dismissing it records WEB_PUSH_NUDGE_ID next to the seen banners
 * (device and account), so it never comes back; turning push on hides it too.
 */
export function WebPushNudge({ onOpenSettings }: Props) {
  const { userId } = useSession()
  const { settings, isLoading } = useUserSettings()
  const [state, setState] = useState<WebPushState | null>(null)
  const [hidden, setHidden] = useState(true)
  const [busy, setBusy] = useState(false)
  const shown = useRef(false)
  /** Turned on or dismissed here: never shown again in this mount, whatever a re-check says. */
  const settled = useRef(false)
  const dismissedOnAccount = !!settings?.seen_banners?.includes(WEB_PUSH_NUDGE_ID)

  useEffect(() => {
    if (Platform.OS !== 'web' || !userId || isLoading) return
    let live = true
    void Promise.all([getWebPushState(), loadSeenBanners()]).then(([s, seen]) => {
      if (!live || settled.current) return
      const dismissed = seen.has(WEB_PUSH_NUDGE_ID) || dismissedOnAccount
      setState(s)
      setHidden(dismissed || (s !== 'ask' && s !== 'needs-install'))
    })
    return () => { live = false }
  }, [userId, isLoading, dismissedOnAccount])

  useEffect(() => {
    if (hidden || !state || shown.current) return
    shown.current = true
    track(ANALYTICS_EVENTS.webPushNudge, { action: 'shown', state })
  }, [hidden, state])

  if (hidden || !state) return null

  const dismiss = () => {
    track(ANALYTICS_EVENTS.webPushNudge, { action: 'dismiss', state })
    settled.current = true
    setHidden(true)
    markBannerSeenOnDevice(WEB_PUSH_NUDGE_ID)
    if (userId) void markBannerSeenOnAccount(userId, WEB_PUSH_NUDGE_ID)
  }

  const act = async () => {
    if (state === 'needs-install') {
      track(ANALYTICS_EVENTS.webPushNudge, { action: 'install', state })
      onOpenSettings()
      return
    }
    track(ANALYTICS_EVENTS.webPushNudge, { action: 'enable', state })
    setBusy(true)
    try {
      const next = await enableWebPush()
      setState(next)
      if (next !== 'ask') { settled.current = true; setHidden(true) }
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={shared.webPushNudge} testID="web-push-nudge">
      <Ionicons name="notifications-outline" size={16} color={theme.colors.primaryText} />
      <Text style={[shared.caption, { flex: 1 }]}>{WEB_PUSH_COPY.nudge}</Text>
      <Pressable onPress={() => void act()} disabled={busy} role="button" style={shared.webPushNudgeAction} testID="web-push-nudge-action">
        <Text style={shared.emptyStateAction}>{state === 'needs-install' ? WEB_PUSH_COPY.nudgeInstall : WEB_PUSH_COPY.nudgeAction}</Text>
      </Pressable>
      <Pressable onPress={dismiss} role="button" aria-label={WEB_PUSH_COPY.nudgeDismiss} style={shared.webPushNudgeAction} testID="web-push-nudge-dismiss">
        <Ionicons name="close" size={18} color={theme.colors.subtext} />
      </Pressable>
    </View>
  )
}
