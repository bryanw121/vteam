import React, { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { Chip } from '../ui'
import { NotificationSettingRow } from './NotificationSettingRow'
import { shared, theme } from '../../constants'
import { GAME_ALERT_LEVELS, GAME_ALERT_SURFACES, GAME_ALERT_TIME_BUCKETS } from '../../constants/gameAlerts'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { useUserSettings } from '../../hooks/useUserSettings'
import { gameAlertSummary, toggleGameAlertFilter } from '../../utils/gameAlerts'
import { track } from '../../lib/analytics'
import type { GameAlertFilterKey, GameAlertPrefs } from '../../types'

/** Taps within this window are saved together (the whole object is written each time). */
const SAVE_DELAY_MS = 600

const FILTER_ROWS: readonly { key: GameAlertFilterKey; label: string; options: readonly { key: string; label: string }[] }[] = [
  { key: 'surfaces', label: 'Surface', options: GAME_ALERT_SURFACES },
  { key: 'levels', label: 'Level', options: GAME_ALERT_LEVELS },
  { key: 'times', label: 'When', options: GAME_ALERT_TIME_BUCKETS },
]

/**
 * Settings → Notifications → New game alerts (#170): where alerts come from
 * (my clubs, hosts I've played with) and "only when it's" filters. No chip in
 * a row means any. The job that sends them is `send_new_game_alerts()`.
 */
export function GameAlertsCard() {
  const { gameAlerts, setGameAlerts } = useUserSettings()
  const [draft, setDraft] = useState<GameAlertPrefs>(gameAlerts)
  const pending = useRef<GameAlertPrefs | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Follow the saved value while nothing is waiting to be saved (first load, another device).
  useEffect(() => {
    if (!pending.current) setDraft(gameAlerts)
  }, [gameAlerts])

  // Save what's waiting if the screen closes inside the window.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (pending.current) void setGameAlerts(pending.current)
  }, [setGameAlerts])

  function change(next: GameAlertPrefs, field: string) {
    setDraft(next)
    pending.current = next
    track(ANALYTICS_EVENTS.gameAlertsChanged, { field })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      const prefs = pending.current
      pending.current = null
      if (prefs) void setGameAlerts(prefs)
    }, SAVE_DELAY_MS)
  }

  const anySource = draft.clubs || draft.hosts

  return (
    <View style={shared.card} testID="settings-game-alerts">
      <Text style={shared.labelStrong}>New game alerts</Text>
      <Text style={[shared.captionStrong, { marginTop: 2, marginBottom: theme.spacing.xs }]} testID="game-alerts-summary">
        {gameAlertSummary(draft)}
      </Text>
      <NotificationSettingRow
        label="From my clubs"
        subtitle="Mute one club with the bell on its page"
        value={draft.clubs}
        onValueChange={v => change({ ...draft, clubs: v }, 'clubs')}
        testID="game-alerts-clubs"
      />
      <NotificationSettingRow
        label="From hosts I've played with"
        subtitle="Hosts whose games you went to twice in the last 6 months"
        value={draft.hosts}
        onValueChange={v => change({ ...draft, hosts: v }, 'hosts')}
        testID="game-alerts-hosts"
      />
      {anySource ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Text style={shared.label}>Only when it's</Text>
          {FILTER_ROWS.map(row => (
            <View key={row.key} style={{ marginTop: theme.spacing.xs }}>
              <Text style={shared.caption}>{row.label}{draft[row.key].length === 0 ? ' · any' : ''}</Text>
              <View style={shared.chipRowWrap} role="group" aria-label={row.label}>
                {row.options.map(o => (
                  <Chip
                    key={o.key}
                    label={o.label}
                    variant="tint"
                    active={(draft[row.key] as string[]).includes(o.key)}
                    onPress={() => change(toggleGameAlertFilter(draft, row.key, o.key), row.key)}
                    testID={`game-alerts-${row.key}-${o.key}`}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
