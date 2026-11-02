import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Vibration, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { TEAM_COLORS } from './teamColors'
import { theme } from '../../constants'
import { activeTimeout, formatClock } from '../../lib/scoresheet/timer'
import { teamName } from '../../lib/scoresheet/summary'
import type { MatchDoc } from '../../types'

type Props = { doc: MatchDoc }

/** Seconds left at which the clock turns to the warning color. */
const WARN_MS = 10_000

/**
 * Countdown for the time-out in progress. It starts when a time-out is recorded and runs from
 * the moment it was tapped, so closing and reopening the app keeps the right time. At zero it
 * buzzes (where the device can) and says time's up until play restarts or it is dismissed.
 */
export function TimeoutTimer({ doc }: Props) {
  const active = activeTimeout(doc.log, doc.setup.rules)
  const [now, setNow] = useState(() => Date.now())
  const [dismissed, setDismissed] = useState<string | null>(null)
  const buzzedFor = useRef<string | null>(null)
  const running = active && dismissed !== active.eventId

  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [running, active?.eventId])

  const left = active ? active.endsAt - now : 0
  const over = left <= 0

  useEffect(() => {
    if (!active || !over || buzzedFor.current === active.eventId) return
    buzzedFor.current = active.eventId
    // Only buzz when the countdown was watched reaching zero, not when reopening long after.
    if (now - active.endsAt < 2000) Vibration.vibrate([0, 300, 150, 300])
  }, [active, over, now])

  if (!active || !running) return null
  const color = TEAM_COLORS[active.team]
  const progress = Math.min(1, Math.max(0, 1 - left / (active.seconds * 1000)))

  return (
    <View
      style={[styles.card, { borderColor: over ? theme.colors.warning : color.fill }]}
      accessibilityRole="timer"
      accessibilityLabel={over ? `Time-out over for ${teamName(doc, active.team)}` : `Time-out ${teamName(doc, active.team)}, ${formatClock(left)} left`}
      accessibilityLiveRegion={over ? 'assertive' : 'none'}
      testID="timeout-timer"
    >
      <View style={styles.row}>
        <Ionicons name={over ? 'alarm' : 'pause-circle'} size={22} color={over ? theme.colors.warning : color.fill} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label} numberOfLines={1}>{over ? "Time's up: back on court" : `Time-out · ${teamName(doc, active.team)}`}</Text>
          {!over && <Text style={styles.sub}>{active.seconds}-second time-out</Text>}
        </View>
        <Text style={[styles.clock, left <= WARN_MS && { color: theme.colors.warning }]} maxFontSizeMultiplier={1.3} testID="timeout-clock">
          {formatClock(left)}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: over ? theme.colors.warning : color.fill }]} />
      </View>
      <Button label={over ? 'Dismiss' : 'End time-out early'} size="sm" variant="secondary" onPress={() => setDismissed(active.eventId)} testID="timeout-dismiss" />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    backgroundColor: theme.colors.card,
    marginBottom: theme.spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  label: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.text },
  sub: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtextStrong },
  clock: { fontFamily: theme.fonts.display, fontSize: theme.font.heading.xxl, color: theme.colors.text, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: theme.colors.background, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
})
