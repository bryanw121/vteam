import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Text'
import { Chip, ScreenState } from '../ui'
import { theme } from '../../constants'
import { useOnlineNow, useTrafficSeries } from '../../hooks/useAdminMetrics'
import { useUrlParam } from '../../hooks/useUrlParam'
import { VIEW } from '../../utils/urlViews'
import {
  bucketLabel, clockTime, minutesSince, onlineLine, PLATFORM_LABELS, platformVersion, screenLabel, TRAFFIC_SPANS, trafficSpan, trafficTick,
} from '../../utils/metrics'
import type { MetricsPlatform } from '../../types'
import { CountRows, MetricCard, PersonRow } from './MetricBits'
import { MetricBarChart, MetricLineChart } from './MetricCharts'
import { metricsStyles as s } from './metricsStyles'

type Props = {
  /** The Live tab is on screen: refresh every 15 s. */
  active: boolean
  onOpenPerson: (id: string) => void
}

/** Metrics → Live: who has the app open right now. */
export function LivePanel({ active, onOpenPerson }: Props) {
  const { data, isLoading, error, refetch } = useOnlineNow({ enabled: active })
  const [spanKey, setSpanKey] = useUrlParam('span', VIEW.metrics.span)
  const span = trafficSpan(spanKey)
  const traffic = useTrafficSeries(span.minutes, { enabled: active })
  const series = traffic.data
  const line = series ? onlineLine(series.points) : []
  const ticks: readonly [string, string] | undefined = series
    ? [trafficTick(series.from, series.minutes), spanKey === '1h' ? 'now' : trafficTick(series.to, series.minutes)]
    : undefined
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
            <View style={s.chips} role="radiogroup" aria-label="How far back">
              {TRAFFIC_SPANS.map(t => (
                <Chip key={t.key} label={t.label} active={t.key === spanKey} role="radio" size="touch" onPress={() => setSpanKey(t.key)} testID={`metrics-span-${t.key}`} />
              ))}
            </View>
            {series && line.length > 1 ? (
              <>
                <MetricLineChart
                  values={line}
                  height={120}
                  color={theme.colors.accent}
                  markLast
                  xLabels={ticks}
                  label={`People online over ${span.phrase}, between ${Math.min(...line)} and ${Math.max(...line)}`}
                />
                <Text style={s.note} testID="metrics-span-note">
                  {series.totals.peak
                    ? `Most at once in ${span.phrase}: ${series.totals.peak.online}, ${series.minutes <= 1440 ? 'at' : 'on'} ${trafficTick(series.totals.peak.at, series.minutes)}. Each point is ${bucketLabel(series.bucket_seconds)}.`
                    : `No samples in ${span.phrase} yet.`}
                </Text>
              </>
            ) : traffic.error ? <Text style={s.note}>Could not load the chart.</Text> : null}
          </MetricCard>

          {series ? (
            <MetricCard title={`Visits in ${span.phrase}`} testID="metrics-visits">
              <Text style={s.big}>{series.totals.visits.toLocaleString('en-US')}</Text>
              <Text style={[s.label, { color: theme.colors.subtextStrong }]}>
                {`${series.totals.visitors.toLocaleString('en-US')} ${series.totals.visitors === 1 ? 'person' : 'people'}: ${series.totals.signed_in_visitors.toLocaleString('en-US')} signed in, ${series.totals.guest_visitors.toLocaleString('en-US')} ${series.totals.guest_visitors === 1 ? 'guest' : 'guests'} · ${series.totals.screen_views.toLocaleString('en-US')} screens opened`}
              </Text>
              {series.totals.visits > 0 ? (
                <MetricBarChart
                  values={series.points.map(pt => pt.visits)}
                  height={96}
                  color={theme.colors.primaryText}
                  xLabels={ticks}
                  label={`Visits over ${span.phrase}: ${series.totals.visits} in all, ${series.totals.guest_visits} by guests`}
                />
              ) : null}
              <Text style={s.note}>A visit is one time someone opens the app or the site, signed in or not. A guest is a device with no account signed in. Visitors that never run the page's code (most bots) aren't counted.</Text>
            </MetricCard>
          ) : null}

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
