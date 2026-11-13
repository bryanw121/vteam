import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { shared, theme } from '../../constants'
import { WEB_PUSH_COPY } from '../../constants/copy'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { track } from '../../lib/analytics'
import { toast } from '../../lib/toast'
import { disableWebPush, enableWebPush, getWebPushState } from '../../utils/pushNotifications'
import type { WebPushState } from '../../types'

type Props = {
  /** Shown under the card while push is on: the per-type switches. */
  children?: React.ReactNode
  /** Tests and the shots harness: start in this state instead of asking the browser. */
  initialState?: WebPushState
}

/**
 * Settings → Notifications on the web (#189): where push stands on this
 * browser, and the one tap that turns it on. iPhone Safari in a tab gets the
 * Add to Home Screen steps first (push only works from there).
 */
export function WebPushCard({ children, initialState }: Props) {
  const [state, setState] = useState<WebPushState | null>(initialState ?? null)
  const [busy, setBusy] = useState(false)
  const tracked = useRef(false)

  useEffect(() => {
    if (initialState) return
    let live = true
    void getWebPushState().then(s => { if (live) setState(s) })
    return () => { live = false }
  }, [initialState])

  useEffect(() => {
    if (!state || tracked.current) return
    tracked.current = true
    track(ANALYTICS_EVENTS.webPushState, { state })
  }, [state])

  const turnOn = useCallback(async () => {
    setBusy(true)
    try {
      const next = await enableWebPush()
      setState(next)
      if (next === 'ask') toast.show({ message: WEB_PUSH_COPY.failed, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }, [])

  const turnOff = useCallback(async () => {
    setBusy(true)
    try {
      await disableWebPush()
      setState('ask')
    } finally {
      setBusy(false)
    }
  }, [])

  if (!state) return null

  return (
    <View style={[shared.card, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]} testID={`web-push-${state}`}>
      <Text style={shared.labelStrong} role="heading">{WEB_PUSH_COPY.title}</Text>
      {state === 'needs-install' ? (
        <>
          <Text style={shared.caption}>{WEB_PUSH_COPY.installIntro}</Text>
          {WEB_PUSH_COPY.installSteps.map((step, i) => (
            <View key={step} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Text style={shared.captionStrong}>{i + 1}.</Text>
              <Text style={[shared.caption, { flex: 1 }]}>{step}</Text>
            </View>
          ))}
        </>
      ) : null}
      {state === 'ask' ? (
        <>
          <Text style={shared.caption}>{WEB_PUSH_COPY.ask}</Text>
          <Button label={WEB_PUSH_COPY.turnOn} icon="notifications-outline" onPress={() => void turnOn()} loading={busy} testID="web-push-enable" />
        </>
      ) : null}
      {state === 'blocked' ? <Text style={shared.caption}>{WEB_PUSH_COPY.blocked}</Text> : null}
      {state === 'unsupported' ? <Text style={shared.caption}>{WEB_PUSH_COPY.unsupported}</Text> : null}
      {state === 'on' ? (
        <>
          <Text style={shared.caption}>{WEB_PUSH_COPY.on}</Text>
          {children}
          <Button label={WEB_PUSH_COPY.turnOff} variant="ghost" size="sm" fullWidth={false} onPress={() => void turnOff()} loading={busy} testID="web-push-disable" />
        </>
      ) : null}
    </View>
  )
}
