import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { ScreenState } from '../ui'
import { theme } from '../../constants'
import { useOnlineNow } from '../../hooks/useAdminMetrics'
import { clockTime, minutesSince, PLATFORM_LABELS, platformVersion, screenLabel } from '../../utils/metrics'
import type { MetricsPlatform } from '../../types'
import { CountRows, MetricCard, PersonRow } from './MetricBits'
import { MetricLineChart } from './MetricCharts'
import { metricsStyles as s } from './metricsStyles'

type Props = {
  /** The Live tab is on screen: refresh every 15 s. */
  active: boolean
  onOpenPerson: (id: string) => void
}

/** Metrics → Live: who has the app open right now. */
export function LivePanel({ active, onOpenPerson }: Props) {
  const { data, isLoading, error, refetch } = useOnlineNow({ enabled: active })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(t)
  }, [active])

  return (
    <ScreenState loading={isLoading} ready={!!data} error={error ? 'Could not load who is online.' : null} onRetry={() => void refetch({ force: true })}>
      {data ? (
        <View style={s.stack}>
          <MetricCard highlight testID="metrics-live-now">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <View style={[s.liveDot, { width: 10, height: 10 }]} />
              <Text style={[s.label, { flex: 1 }]}>{`Online now · updated ${Math.max(0, Math.round((now - Date.parse(data.at)) / 1000))} s ago`}</Text>
            </View>
            <Text style={[s.big, { fontSize: theme.font.heading.splash, lineHeight: theme.font.heading.splash + 4 }]}>{data.online}</Text>
            <Text style={[s.label, { color: theme.colors.subtextStrong }]}>
              {`${data.signed_in} signed in · ${data.guests} ${data.guests === 1 ? 'guest' : 'guests'}`}
              {data.today_peak ? ` · today's peak ${data.today_peak.peak} at ${clockTime(data.today_peak.at)}` : ''}
            </Text>
            {data.last_hour.length > 1 ? (
              <>
                <MetricLineChart
                  values={data.last_hour.map(p => p.online)}
                  height={70}
                  color={theme.colors.accent}
                  markLast
                  label={`People online over the last hour, between ${Math.min(...data.last_hour.map(p => p.online))} and ${Math.max(...data.last_hour.map(p => p.online))}`}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.note}>60 min ago</Text>
                  <Text style={s.note}>now</Text>
                </View>
              </>
            ) : null}
          </MetricCard>

          <View style={s.grid2}>
            <View style={[s.gridCell]}>
              <MetricCard title="By platform">
                {Object.keys(data.by_platform).length
                  ? <CountRows rows={(Object.entries(data.by_platform) as [MetricsPlatform, number][]).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ label: PLATFORM_LABELS[p] ?? p, value: n }))} />
                  : <Text style={s.note}>Nobody yet.</Text>}
              </MetricCard>
            </View>
            <View style={[s.gridCell]}>
              <MetricCard title="By screen">
                {data.by_screen.length
                  ? <CountRows rows={data.by_screen.slice(0, 6).map(r => ({ label: screenLabel(r.screen), value: r.people }))} />
                  : <Text style={s.note}>Nobody yet.</Text>}
              </MetricCard>
            </View>
          </View>

          <MetricCard title="Online now">
            {data.people.length === 0 && data.guests === 0 ? <Text style={s.note}>Nobody has the app open.</Text> : null}
            {data.people.map((p, i) => (
              <PersonRow
                key={p.user_id}
                first={i === 0}
                person={p}
                meta={`${screenLabel(p.screen)} · ${platformVersion(p.platform, p.app_version)} · ${minutesSince(p.started_at, new Date(now))}`}
                onPress={() => onOpenPerson(p.user_id)}
                testID={`metrics-live-person-${p.user_id}`}
              />
            ))}
            {data.guests > 0 ? (
              <PersonRow
                first={data.people.length === 0}
                person={{ username: '?', first_name: null, last_name: null }}
                nameOverride={`${data.guests} ${data.guests === 1 ? 'guest' : 'guests'}`}
                meta={[data.guest_screens.map(screenLabel).join(', '), data.guest_platforms.map(p => PLATFORM_LABELS[p] ?? p).join(', ')].filter(Boolean).join(' · ')}
              />
            ) : null}
          </MetricCard>
          <Text style={s.note}>Refreshes every 15 s while this screen is open. Someone counts as online for 90 s after their last heartbeat.</Text>
        </View>
      ) : null}
    </ScreenState>
  )
}
