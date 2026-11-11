import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Text } from '../../../../../components/ui/Text'
import { EmptyState, ScreenContainer, ScreenState } from '../../../../../components/ui'
import { MetricCard } from '../../../../../components/metrics/MetricBits'
import { metricsStyles as s } from '../../../../../components/metrics/metricsStyles'
import { useStackBackTitle } from '../../../../../hooks/useStackBackTitle'
import { useAdminUserActivity, useIsAdmin } from '../../../../../hooks/useAdminMetrics'
import { useTabsShell } from '../../../../../contexts/tabs'
import { COMPACT_TEXT_SCALE, shared, theme } from '../../../../../constants'
import { profileFullName, profileInitial } from '../../../../../utils'
import { routes } from '../../../../../utils/routes'
import {
  activeDayWeeks, activityLevel, chicagoDateKey, clockTime, daysBetween, formatSeconds, joinedDate, lastSeenLabel, minutesSince,
  PLATFORM_LABELS, platformVersion, screenLabel, screenPath, shortDay,
} from '../../../../../utils/metrics'
import type { AdminSession, AdminUserActivity } from '../../../../../types'

/** Shades for the active-days grid; index = activityLevel. */
const DAY_BG = [theme.colors.borderSoft, theme.colors.primarySoft, theme.colors.timeBorder, theme.colors.primary] as const

/** Admin metrics → one person: how they came, platforms, activity and recent sessions (screen types only). */
export default function AdminPersonScreen() {
  useStackBackTitle('Person')
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { tabBarHeight } = useTabsShell()
  const { isAdmin, checked } = useIsAdmin()
  const { data, isLoading, error, refetch } = useAdminUserActivity(checked && isAdmin ? id : undefined)

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={[shared.scrollContentSubpage, { paddingBottom: tabBarHeight + theme.spacing.xl }]}>
        <ScreenContainer>
          {checked && !isAdmin ? (
            <EmptyState icon="lock-closed-outline" title="Admins only" body="Usage metrics are only available to vteam admins." />
          ) : (
            <ScreenState
              loading={!checked || isLoading}
              ready={data !== undefined}
              error={error ? 'Could not load this person.' : null}
              onRetry={() => void refetch({ force: true })}
              empty={data === null}
              emptyIcon="person-outline"
              emptyTitle="No such account"
            >
              {data ? <Person data={data} onViewProfile={() => router.push(routes.profileOf(data.id))} /> : null}
            </ScreenState>
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  )
}

function Person({ data, onViewProfile }: { data: AdminUserActivity; onViewProfile: () => void }) {
  const now = new Date()
  const today = chicagoDateKey(now)
  const activeDays = data.days.filter(d => d.minutes > 0).length
  const guestDays = daysBetween(data.first_seen_as_guest, data.created_at)
  const firstCame = data.first_seen_as_guest
    ? guestDays > 0 ? `Guest, ${guestDays} ${guestDays === 1 ? 'day' : 'days'} earlier` : 'Guest, same day'
    : 'Signed up first'
  const status = data.online
    ? `Online now${data.screen ? ` · on ${screenLabel(data.screen).toLowerCase()}` : ''}`
    : lastSeenLabel(data.last_seen, false, now)

  return (
    <View style={s.stack}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View style={[s.avatar, { width: 60, height: 60, borderRadius: 30 }]}>
          <Text style={[s.avatarText, { fontFamily: theme.fonts.display, fontSize: theme.font.heading.sm }]}>{profileInitial(data)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start', gap: theme.spacing.xxs }}>
          <Text style={[shared.heading, { fontSize: theme.font.size.xl }]} accessibilityRole="header" numberOfLines={2}>{profileFullName(data)}</Text>
          <Text style={[s.label, data.online && { color: theme.colors.success }]}>{status}</Text>
          <Pressable
            onPress={onViewProfile}
            accessibilityRole="link"
            style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [styles.profileLink, hovered && { borderColor: theme.colors.primary }]}
            testID="metrics-person-profile"
          >
            <Text style={[s.label, { color: theme.colors.primaryText, fontFamily: theme.fonts.bodySemiBold }]}>View profile</Text>
          </Pressable>
        </View>
      </View>

      <View style={[s.card, styles.facts]}>
        <Fact label="Joined" value={data.created_at ? joinedDate(data.created_at) : '–'} />
        <Fact label="First came as" value={firstCame} />
        <Fact label="Platforms" value={data.platforms.length ? data.platforms.map(p => PLATFORM_LABELS[p] ?? p).join(', ') : '–'} />
        <Fact label="App version" value={platformVersion(data.platform, data.app_version)} />
      </View>

      <View style={styles.stats}>
        <Stat value={String(data.sessions_30d)} label="Sessions · 30d" />
        <Stat value={String(activeDays)} label="Days active · 35d" />
        <Stat value={formatSeconds(data.median_session_s)} label="Median session" />
        <Stat value={String(data.rsvps)} label="RSVPs" />
        <Stat value={String(data.hosted)} label="Hosted" />
        <Stat value={String(data.kudos_given)} label="Kudos given" />
      </View>

      <MetricCard title="Active days" aside="last 5 weeks">
        <View style={{ gap: 5 }} accessible accessibilityRole="image" accessibilityLabel={`Active on ${activeDays} of the last 35 days`}>
          {activeDayWeeks(data.days).map((week, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 5 }}>
              {week.map((d, j) => (
                <View
                  key={j}
                  style={[
                    styles.day,
                    { backgroundColor: d ? DAY_BG[activityLevel(d.minutes)] : 'transparent' },
                    d?.day === today && styles.today,
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={s.note}>Mon … Sun · brighter = more time</Text>
          <Text style={s.note}>today outlined</Text>
        </View>
      </MetricCard>

      <MetricCard title="Recent sessions">
        {data.recent.length === 0 ? <Text style={s.note}>No sessions yet.</Text> : data.recent.map((r, i) => (
          <SessionRow key={r.id} session={r} first={i === 0} live={data.online && i === 0 && r.last_seen === data.last_seen} now={now} />
        ))}
      </MetricCard>
      <Text style={s.note}>Screen types only, never which event or profile. Deleting the account deletes these sessions.</Text>
    </View>
  )
}

function SessionRow({ session, first, live, now }: { session: AdminSession; first: boolean; live: boolean; now: Date }) {
  const day = chicagoDateKey(new Date(session.started_at))
  const today = chicagoDateKey(now)
  const when = live ? 'Now' : day === today ? `Today ${clockTime(session.started_at)}` : lastSeenLabel(session.started_at, false, now) === 'Yesterday' ? 'Yesterday' : shortDay(day)
  const length = live
    ? `${minutesSince(session.started_at, now)} so far`
    : formatSeconds((Date.parse(session.last_seen) - Date.parse(session.started_at)) / 1000)
  return (
    <View style={[s.row, { alignItems: 'flex-start', gap: theme.spacing.md }, first && s.rowFirst]}>
      <Text style={[s.label, { width: 84, color: theme.colors.subtextStrong }]} maxFontSizeMultiplier={COMPACT_TEXT_SCALE}>{when}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.label, { color: theme.colors.text }]}>{`${platformVersion(session.platform, session.app_version)} · ${length}`}</Text>
        <Text style={s.note}>{session.screens.length ? screenPath(session.screens) : 'No screens recorded'}</Text>
      </View>
    </View>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={s.note}>{label}</Text>
      <Text style={[s.rowLabel, { fontFamily: theme.fonts.bodySemiBold }]}>{value}</Text>
    </View>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={[s.card, styles.stat]}>
      <Text style={[s.big, { fontSize: theme.font.size.xl }]}>{value}</Text>
      <Text style={s.note}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  profileLink: {
    minHeight: 44,
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
  },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.spacing.md, columnGap: theme.spacing.md },
  fact: { flexBasis: '45%', flexGrow: 1, gap: 2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  stat: { flexBasis: '30%', flexGrow: 1, gap: 0, padding: theme.spacing.sm + 4 },
  day: { flex: 1, height: 30, borderRadius: 6 },
  today: { borderWidth: 2, borderColor: theme.colors.accent },
})
