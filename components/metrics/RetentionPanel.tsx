import { StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import { ScreenState } from '../ui'
import { COMPACT_TEXT_SCALE, theme } from '../../constants'
import { useRetention } from '../../hooks/useAdminMetrics'
import { mergeSmallCohorts, percentOf, RETENTION_WEEKS, retentionLevel, shortDay } from '../../utils/metrics'
import { MetricCard } from './MetricBits'
import { metricsStyles as s } from './metricsStyles'

type Props = { active: boolean }

const WEEK_LABELS: Record<(typeof RETENTION_WEEKS)[number], string> = { w1: 'Week 1', w2: 'Week 2', w4: 'Week 4', w8: 'Week 8' }

/** Shades from "few came back" to "most came back"; index = retentionLevel. */
const LEVEL_BG = [theme.colors.borderSoft, theme.colors.primarySoft, theme.colors.timeBorder, theme.colors.primaryDark] as const

/** Metrics → Retention: do new players come back? */
export function RetentionPanel({ active }: Props) {
  const { data, isLoading, error, refetch } = useRetention({ enabled: active })
  const cohorts = data ? mergeSmallCohorts(data.cohorts) : []
  const guestRate = data ? percentOf(data.guest_converted, data.guest_devices) : null

  return (
    <ScreenState loading={isLoading} ready={!!data} error={error ? 'Could not load retention.' : null} onRetry={() => void refetch({ force: true })}>
      {data ? (
        <View style={s.stack}>
          <MetricCard title="Do new players come back?">
            <Text style={s.note}>Each row is one week's sign-ups. Cells: the share active again that many weeks later.</Text>
            {cohorts.length === 0 ? <Text style={s.note}>No sign-ups in the last 12 weeks.</Text> : (
              <View style={{ gap: 4 }}>
                <View style={styles.row}>
                  <Text style={[styles.head, styles.first]} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>Signed up</Text>
                  {RETENTION_WEEKS.map(w => <Text key={w} style={styles.head} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>{WEEK_LABELS[w]}</Text>)}
                </View>
                {cohorts.map(c => (
                  <View key={c.week} style={styles.row} testID={`metrics-cohort-${c.week}`}>
                    <Text style={[styles.cohort, styles.first]} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>{`${shortDay(c.week)} · ${c.size}`}</Text>
                    {RETENTION_WEEKS.map(w => {
                      const n = c[w]
                      const pct = n === null ? null : percentOf(n, c.size)
                      const level = retentionLevel(pct)
                      return (
                        <View
                          key={w}
                          style={[styles.cell, { backgroundColor: LEVEL_BG[level] }]}
                          accessible
                          accessibilityLabel={`Signed up week of ${shortDay(c.week)}, ${WEEK_LABELS[w]}: ${pct === null ? 'not yet' : `${pct} percent`}`}
                        >
                          <Text style={[styles.cellText, pct === null && { color: theme.colors.subtext }]} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>
                            {pct === null ? '–' : `${pct}%`}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                ))}
              </View>
            )}
            <View style={[s.chips, { gap: theme.spacing.sm }]}>
              <Text style={s.note}>Fewer</Text>
              {LEVEL_BG.slice(1).map(c => <View key={c} style={{ width: 22, height: 12, borderRadius: 3, backgroundColor: c }} />)}
              <Text style={s.note}>More</Text>
              <Text style={[s.note, { marginLeft: 'auto' }]}>– not yet</Text>
            </View>
          </MetricCard>

          <MetricCard title="Guests who signed up">
            <Text style={s.big}>{guestRate === null ? '–' : `${guestRate}%`}</Text>
            <Text style={s.note}>
              {data.guest_devices
                ? `of guest devices in the last 30 days (${data.guest_converted} of ${data.guest_devices}) later signed in on the same device.`
                : 'No guest visits in the last 30 days yet.'}
            </Text>
          </MetricCard>
          <Text style={s.note}>Weeks with fewer than 3 sign-ups are merged so one person doesn't swing a cell.</Text>
        </View>
      ) : null}
    </ScreenState>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  first: { flex: 1.5, textAlign: 'left' },
  head: { flex: 1, textAlign: 'center', fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.subtext },
  cohort: { fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.smd, color: theme.colors.subtextStrong },
  cell: { flex: 1, minHeight: 36, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.text },
})
