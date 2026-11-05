import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { theme } from '../../constants'
import { formatClock } from '../../lib/scoresheet/timer'
import type { MatchDoc, MatchState } from '../../types'

type Props = { doc: MatchDoc; state: MatchState; onTimeUp: () => void }

const WARNING_MS = 2 * 60_000

/**
 * The match clock for timed formats (NAGVA pool play): counts down from the first serve, warns
 * at 2 minutes (no more time-outs), and at zero offers "End on time", which gives the set to the
 * team ahead, or makes the next point decide a tied set. Counted from the saved first-serve time,
 * so it stays right after the app is closed and reopened.
 */
export function MatchClock({ doc, state, onTimeUp }: Props) {
  const limit = doc.setup.rules.format.timeLimitMinutes
  const first = state.sets[0]
  const [now, setNow] = useState(() => Date.now())
  const running = !!limit && !!first && !state.over && !state.timeExpired

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  if (!running || !limit || !first) return null
  const left = first.startedAt + limit * 60_000 - now
  const warning = left <= WARNING_MS
  const up = left <= 0
  const color = up ? theme.colors.error : warning ? theme.colors.warning : theme.colors.subtextStrong

  return (
    <View style={[styles.card, (warning || up) && { borderColor: color }]} accessibilityRole="timer" accessibilityLabel={up ? "Match time is up" : `Match clock, ${formatClock(left)} left`} testID="match-clock">
      <View style={styles.row}>
        <Ionicons name={up ? 'alarm' : 'time-outline'} size={18} color={color} />
        <Text style={[styles.label, { color }]}>
          {up ? "Time's up" : warning ? '2-minute warning: no time-outs' : 'Match clock'}
        </Text>
        <Text style={[styles.clock, { color: up ? theme.colors.error : theme.colors.text }]} maxFontSizeMultiplier={1.3}>{formatClock(left)}</Text>
      </View>
      {up && (
        <>
          <Text style={styles.sub}>Finish the rally in play, then end on time: the team ahead takes the set, or the next point decides a tie.</Text>
          <Button label="End on time" icon="flag-outline" size="sm" onPress={onTimeUp} testID="time-up" />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm, padding: theme.spacing.sm, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, marginBottom: theme.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  label: { flex: 1, fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm },
  clock: { fontFamily: theme.fonts.display, fontSize: theme.font.size.xl, fontVariant: ['tabular-nums'] },
  sub: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtextStrong },
})
