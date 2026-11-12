import { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Text } from '../ui/Text'
import { Chip, ScreenState } from '../ui'
import { theme } from '../../constants'
import { useMetricsEvents, useMetricsOverview } from '../../hooks/useAdminMetrics'
import {
  clockTime, feedFilterLabel, formatDelta, formatSeconds, metricsRange, outsideKindsLine, percentOf, platformShares, screenLabel, shortDay, weekdayDay,
} from '../../utils/metrics'
import type { MetricsEvents, MetricsOverview, MetricsPlatform, MetricsRangeDays } from '../../types'
import { CountRows, FunnelBars, MetricCard, StatCard } from './MetricBits'
import { MetricBarChart, MetricLineChart } from './MetricCharts'
import { metricsStyles as s } from './metricsStyles'
import { useUrlParam } from '../../hooks/useUrlParam'
import { VIEW } from '../../utils/urlViews'

type Props = {
  onOpenLive: () => void
}

const RANGES: MetricsRangeDays[] = [7, 30, 90]

export const PLATFORM_COLORS: Record<MetricsPlatform, string> = {
  ios: theme.colors.primary,
  web: theme.colors.accent,
  android: theme.colors.warning,
}

/** Metrics → Overview: headline numbers for the last 7, 30 or 90 days. */
export function OverviewPanel({ onOpenLive }: Props) {
  const [days, setDays] = useUrlParam('range', VIEW.metrics.range)
  const range = useMemo(() => metricsRange(days), [days])
  const { data, isLoading, error, refetch } = useMetricsOverview(range)
  // The part-3 events load beside it; their cards wait for them without holding up the rest.
  const events = useMetricsEvents(range)

  return (
    <View style={s.stack}>
      <View style={s.chips} role="radiogroup" aria-label="Range">
        {RANGES.map(d => (
          <Chip key={d} label={`${d} days`} active={d === days} role="radio" size="touch" onPress={() => setDays(d)} testID={`metrics-range-${d}`} />
        ))}
      </View>
      <ScreenState loading={isLoading} ready={!!data} error={error ? 'Could not load metrics.' : null} onRetry={() => void refetch({ force: true })}>
        {data ? <Overview data={data} events={events.data ?? null} days={days} onOpenLive={onOpenLive} /> : null}
      </ScreenState>
    </View>
  )
}

function Overview({ data, events, days, onOpenLive }: { data: MetricsOverview; events: MetricsEvents | null; days: MetricsRangeDays; onOpenLive: () => void }) {
  const dauDelta = formatDelta(data.dau_avg, data.dau_avg_prev, `prior ${days} days`)
  const wauDelta = formatDelta(data.wau, data.wau_prev, 'last week')
  const stickiness = data.dau_avg !== null ? percentOf(data.dau_avg, data.mau) : null
  const activeDays = data.daily.filter(d => d.active > 0)
  const people = data.daily.reduce((n, d) => n + d.active, 0)
  const perPersonDay = people ? Math.round((data.sessions / people) * 10) / 10 : null
  const busiest = data.daily.reduce<MetricsOverview['daily'][number] | null>((best, d) => (!best || d.active > best.active ? d : best), null)
  const record = data.daily.reduce<MetricsOverview['daily'][number] | null>((best, d) => (d.peak !== null && (!best || d.peak > (best.peak ?? 0)) ? d : best), null)
  const shares = platformShares(data.platforms)

  return (
    <View style={s.stack}>
      <Pressable
        onPress={onOpenLive}
        accessibilityRole="button"
        accessibilityLabel={`Online now: ${data.online.now}. ${data.online.signed_in} signed in, ${data.online.guests} guests. Open Live`}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [s.card, s.cardHighlight, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }, (pressed || hovered) && { backgroundColor: theme.colors.borderSoft }]}
        testID="metrics-online-card"
      >
        <View style={s.liveDot} />
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Online now</Text>
          <Text style={s.big}>
            {data.online.now}
            <Text style={[s.label, { color: theme.colors.subtextStrong }]}>{`  ${data.online.signed_in} signed in · ${data.online.guests} ${data.online.guests === 1 ? 'guest' : 'guests'}`}</Text>
          </Text>
        </View>
        <Text style={[s.label, { color: theme.colors.primaryText }]}>Live ›</Text>
      </Pressable>

      <View style={s.grid2}>
        <StatCard label="Daily active (avg)" value={data.dau_avg === null ? '–' : String(data.dau_avg)} sub={dauDelta} subTone={deltaTone(data.dau_avg, data.dau_avg_prev)} testID="metrics-dau" />
        <StatCard label="Weekly active" value={String(data.wau)} sub={wauDelta} subTone={deltaTone(data.wau, data.wau_prev)} />
        <StatCard label="Monthly active" value={String(data.mau)} sub={`of ${data.accounts} accounts`} />
        <StatCard label="Stickiness" value={stickiness === null ? '–' : `${stickiness}%`} sub="daily ÷ monthly" />
        <StatCard label="New sign-ups" value={String(data.signups)} sub={`${data.signups_from_guests} started as guests`} />
        <StatCard label="Median session" value={formatSeconds(data.median_session_s)} sub={perPersonDay === null ? null : `${perPersonDay} sessions / person / day`} />
      </View>

      <MetricCard title="Daily active people" aside={`${shortDay(data.from)} – ${shortDay(data.to)}`}>
        <MetricLineChart
          values={data.daily.map(d => d.active)}
          height={132}
          color={theme.colors.primary}
          markMax
          xLabels={[shortDay(data.from), shortDay(data.to)]}
          label={`Daily active people from ${shortDay(data.from)} to ${shortDay(data.to)}: active on ${activeDays.length} days${busiest ? `, most ${busiest.active} on ${weekdayDay(busiest.day)}` : ''}`}
        />
        {busiest && busiest.active > 0 ? <Text style={s.note}>{`Busiest: ${busiest.active} on ${weekdayDay(busiest.day)}`}</Text> : null}
      </MetricCard>

      <MetricCard title="Peak online per day" aside={record?.peak ? `max ${record.peak}` : undefined}>
        <MetricBarChart
          values={data.daily.map(d => d.peak)}
          height={88}
          color={theme.colors.accent}
          xLabels={[shortDay(data.from), shortDay(data.to)]}
          label={record?.peak ? `Most people online at once each day; the record is ${record.peak} on ${weekdayDay(record.day)}` : 'No online samples in this range yet'}
        />
        <Text style={s.note}>
          {record?.peak && record.peak_at ? `Record: ${record.peak} at ${clockTime(record.peak_at)}, ${weekdayDay(record.day)}.` : 'No samples yet.'}
        </Text>
      </MetricCard>

      <MetricCard title="Platforms">
        {shares.length ? (
          <>
            <View
              style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: theme.colors.borderSoft }}
              accessible
              accessibilityRole="image"
              accessibilityLabel={shares.map(p => `${p.label} ${p.percent} percent`).join(', ')}
            >
              {shares.map(p => <View key={p.platform} style={{ flex: p.people, backgroundColor: PLATFORM_COLORS[p.platform] }} />)}
            </View>
            <View style={[s.chips, { gap: theme.spacing.md }]}>
              {shares.map(p => (
                <View key={p.platform} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: PLATFORM_COLORS[p.platform] }} />
                  <Text style={[s.label, { color: theme.colors.subtextStrong }]}>{`${p.label} ${p.percent}%`}</Text>
                </View>
              ))}
            </View>
          </>
        ) : <Text style={s.note}>No sessions in this range yet.</Text>}
        {data.versions.newest ? (
          <Text style={s.note}>
            {data.versions.behind
              ? `${data.versions.behind} ${data.versions.behind === 1 ? 'person is' : 'people are'} on a native build older than ${data.versions.newest}. Contract migrations wait for 0.`
              : `Everyone on iOS and Android is on ${data.versions.newest}.`}
          </Text>
        ) : null}
      </MetricCard>

      <MetricCard title="Top screens">
        {data.top_screens.length
          ? <CountRows rows={data.top_screens.map(t => ({ label: screenLabel(t.screen), value: t.views }))} />
          : <Text style={s.note}>No screen views in this range yet.</Text>}
      </MetricCard>

      <MetricCard title="Actions">
        <CountRows rows={[
          { label: 'RSVPs', value: data.actions.rsvps },
          { label: 'Events hosted', value: data.actions.hosted },
          { label: 'Messages', value: data.actions.messages },
          { label: 'Kudos given', value: data.actions.kudos },
          { label: 'Friend requests', value: data.actions.friend_requests },
          { label: 'Clubs joined', value: data.actions.clubs_joined },
          { label: 'Outside sign-up links opened', value: data.actions.outside_links },
          ...(events ? [{ label: 'Events shared', value: events.shares.taps }] : []),
        ]} />
        <Text style={s.note}>Test accounts (the e2e bots) are left out of these counts.</Text>
      </MetricCard>

      <MetricCard title="Feed → RSVP">
        <FunnelBars steps={[
          { label: 'Opened the feed', n: data.funnel.feed },
          { label: 'Opened an event', n: data.funnel.event },
          { label: 'RSVPed', n: data.funnel.rsvp },
        ]} />
        <Text style={s.note}>{`People, last ${days} days. Percent = of the step before.`}</Text>
      </MetricCard>

      {events ? <EventCards events={events} days={days} /> : null}
    </View>
  )
}

/** The cards fed by the part-3 client events (admin_metrics_events). */
function EventCards({ events, days }: { events: MetricsEvents; days: MetricsRangeDays }) {
  const kinds = outsideKindsLine(events.outside_links.by_kind)
  return (
    <>
      <MetricCard title="Guest → sign-up → RSVP">
        <FunnelBars steps={[
          { label: 'Guest devices', n: events.guest_funnel.guests },
          { label: 'Signed in', n: events.guest_funnel.signed_in },
          { label: 'RSVPed', n: events.guest_funnel.rsvped },
        ]} />
        <Text style={s.note}>{`Devices that first came as guests in the last ${days} days. Percent = of the step before.`}</Text>
      </MetricCard>

      <MetricCard title="Outside sign-ups" aside={`${events.outside_links.taps} taps · ${events.outside_links.people} people`}>
        {events.outside_links.top_orgs.length
          ? <CountRows rows={events.outside_links.top_orgs.map(o => ({ label: o.org, value: o.taps }))} />
          : <Text style={s.note}>Nobody has tapped through to an outside sign-up in this range yet.</Text>}
        {kinds ? <Text style={s.note}>{kinds}</Text> : null}
      </MetricCard>

      <View style={s.grid2}>
        <View style={s.gridCell}>
          <MetricCard title="Feed filters">
            {events.filters.length
              ? <CountRows rows={events.filters.slice(0, 5).map(f => ({ label: feedFilterLabel(f.filter, f.surface), value: f.times }))} />
              : <Text style={s.note}>No filter changes yet.</Text>}
          </MetricCard>
        </View>
        <View style={s.gridCell}>
          <MetricCard title="Scorekeeper">
            <CountRows rows={[
              { label: 'Matches started', value: events.scorekeeper.started },
              { label: 'Matches finished', value: events.scorekeeper.finished },
              { label: 'People scoring', value: events.scorekeeper.people },
            ]} />
          </MetricCard>
        </View>
      </View>
    </>
  )
}

function deltaTone(cur: number | null, prev: number | null): 'up' | 'down' | 'note' {
  if (cur === null || prev === null || cur === prev) return 'note'
  return cur > prev ? 'up' : 'down'
}
