import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Vibration, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { Button } from '../Button'
import { theme } from '../../constants'
import { formatClock } from '../../lib/scoresheet/timer'
import { toast } from '../../lib/toast'
import type { MatchDoc, MatchState } from '../../types'

type Props = { doc: MatchDoc; state: MatchState; onTimeUp: () => void; onAddTime: (minutes: number) => void }

const WARNING_MS = 2 * 60_000
const ADD_OPTIONS = [1, 2, 5]

/**
 * The match clock for timed formats (NAGVA pool play): counts down from the first serve, warns
 * at 2 minutes (no more time-outs). At zero it alerts once (vibration and a toast) and leaves
 * the call to the scorekeeper: play on, add time (+1, +2, +5 min, recorded in the log), or
 * "End on time", which gives the set to the team ahead, or makes the next point decide a tied
 * set. Counted from the saved first-serve time, so it stays right after the app is closed and reopened.
 */
export function MatchClock({ doc, state, onTimeUp, onAddTime }: Props) {
  const base = doc.setup.rules.format.timeLimitMinutes
  const limit = base ? base + state.addedMinutes : null
  const first = state.sets[0]
  const [now, setNow] = useState(() => Date.now())
  const running = !!limit && !!first && !state.over && !state.timeExpired

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  const left = running && limit && first ? first.startedAt + limit * 60_000 - now : Infinity
  const up = left <= 0

  // Alert once each time the clock reaches zero (again after time is added).
  const alerted = useRef<number | null>(null)
  useEffect(() => {
    if (!up || alerted.current === limit) return
    alerted.current = limit
    Vibration.vibrate([0, 300, 150, 300])
    const live = state.current != null ? state.sets[state.current] : null
    const a = live?.teams.A.score ?? 0
    const b = live?.teams.B.score ?? 0
    const name = (side: 'A' | 'B') => doc.setup.teams[side].name
    const lead = a === b ? `Tied ${a}–${b}` : `${name(a > b ? 'A' : 'B')} leads ${Math.max(a, b)}–${Math.min(a, b)}`
    toast.show({ title: "Time's up", message: `${lead}. End on time or add time when the rally is over.`, variant: 'warning' })
  }, [up, limit, state, doc])

  if (!running || !limit || !first) return null
  const warning = left <= WARNING_MS
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
          <Text style={styles.sub}>Finish the rally in play. End on time gives the set to the team ahead (a tie goes to the next point), or add time and keep playing.</Text>
          <View style={styles.actions}>
            {ADD_OPTIONS.map(min => (
              <Button key={min} label={`+${min} min`} variant="secondary" size="sm" fullWidth={false} onPress={() => onAddTime(min)} accessibilityLabel={`Add ${min} minute${min === 1 ? '' : 's'} to the match clock`} testID={`add-time-${min}`} />
            ))}
            <View style={{ flex: 1, minWidth: 140 }}>
              <Button label="End on time" icon="flag-outline" size="sm" onPress={onTimeUp} testID="time-up" />
            </View>
          </View>
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  sub: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtextStrong },
})
