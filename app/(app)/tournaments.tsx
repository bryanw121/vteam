import React, { useMemo, useState } from 'react'
import { FlatList, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from '../../components/ui/Text'
import { Stack, useRouter } from 'expo-router'
import { shared, theme } from '../../constants'
import { FORMAT_LABELS } from '../../constants/tournamentCopy'
import { useSession } from '../../contexts/session'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { useTournamentList } from '../../hooks/useTournamentList'
import { RefreshControl } from '../../components/RefreshControl'
import { EmptyState, IconButton, ScreenContainer, ScreenHeader, Spinner } from '../../components/ui'
import { routes } from '../../utils/routes'
import { splitTournaments } from '../../utils/tournamentList'
import { useFreeAgentCounts } from '../../hooks/useFreeAgents'
import { ProgramSection } from '../../components/programs/ProgramSection'
import { useExternalPrograms } from '../../hooks/useExternalPrograms'
import { useProgramSheet } from '../../hooks/useProgramSheet'
import { useFeedRegion } from '../../hooks/useFeedCity'
import { PROGRAMS_SOURCE_NOTE } from '../../constants/copy'
import { ProgramHostChips } from '../../components/programs/ProgramHostChips'
import { byHost } from '../../utils/externalPrograms'
import { ShareLinkButton } from '../../components/ShareLinkButton'
import { useUrlParam } from '../../hooks/useUrlParam'
import { VIEW } from '../../utils/urlViews'
import type { TournamentListItem } from '../../types'
import { formatDate } from '../../utils/dateFormat'
import { CLUB_TILE_COLORS } from '../../constants/theme'

type Tab = 'upcoming' | 'past'

/** The same cover colour for a tournament everywhere, from its name (the palette club tiles use). */
function coverColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return CLUB_TILE_COLORS[Math.abs(h) % CLUB_TILE_COLORS.length]
}

/** What a club tournament's cover says about it (the tournament page keeps its own badge). */
const STATUS_LABEL: Record<string, string> = {
  published: 'Registration open', in_progress: 'In progress', completed: 'Completed', draft: 'Draft', cancelled: 'Cancelled',
}
/** A blank line of text in a placeholder: the same font metrics as the real line, with a bar instead of words. */
const BLANK = '\u00a0'

/**
 * The club tournaments while they load on a first visit (returning viewers have them from the
 * device): the section header and two cards in the final layout, so the outside tournaments below
 * don't get pushed down when they arrive.
 */
function ClubTournamentsSkeleton({ showHeader }: { showHeader: boolean }) {
  return (
    <View testID="tournaments-club-loading" accessibilityLabel="Loading club tournaments">
      {showHeader && <Text accessibilityRole="header" style={shared.programSectionTitle}>Your clubs</Text>}
      {[0, 1].map(i => (
        <View key={i} style={styles.card} aria-hidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.cover, { backgroundColor: theme.colors.border }]}>
            <View style={[styles.coverPill, { backgroundColor: theme.colors.borderSoft }]}><Text style={[styles.coverPillText, { opacity: 0 }]}>{STATUS_LABEL.published}</Text></View>
            <Text style={[styles.coverTitle, { opacity: 0 }]}>{BLANK}</Text>
          </View>
          <View style={styles.body}>
            <View style={{ alignSelf: 'flex-start', width: '60%', borderRadius: theme.radius.sm, backgroundColor: theme.colors.borderSoft }}><Text style={styles.meta}>{BLANK}</Text></View>
            <View style={styles.bar} />
            <View style={{ alignSelf: 'flex-start', width: '40%', borderRadius: theme.radius.sm, backgroundColor: theme.colors.borderSoft }}><Text style={styles.teams}>{BLANK}</Text></View>
          </View>
        </View>
      ))}
    </View>
  )
}

/** A club tournament as a cover card (Party invite layout): status and name on its colour, then when and where, and how full it is. */
function TournamentRow({ item, onPress }: { item: TournamentListItem; onPress: () => void }) {
  const d = new Date(item.start_date)
  const when = formatDate(d, { weekday: 'short', month: 'short', day: 'numeric' })
  const meta = [when, item.location || item.club_name].filter(Boolean).join(' · ')
  const fill = item.max_teams ? Math.min(1, item.team_count / item.max_teams) : null
  const teams = item.max_teams
    ? `${item.team_count} of ${item.max_teams} teams${item.team_count >= item.max_teams ? ' · full' : ''}`
    : `${item.team_count} ${item.team_count === 1 ? 'team' : 'teams'}`
  const cover = coverColor(item.title)
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${formatDate(d, { weekday: 'long', month: 'long', day: 'numeric' })}. ${teams}`}
      style={styles.card}
      testID={`tournament-row-${item.id}`}
    >
      <View style={[styles.cover, { backgroundColor: cover }]}>
        <View style={styles.coverPill}><Text style={styles.coverPillText}>{STATUS_LABEL[item.status] ?? item.status}</Text></View>
        <Text style={styles.coverTitle} numberOfLines={1}>{item.title}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        <View style={styles.bar}>{fill !== null && <View style={[styles.barFill, { width: `${Math.round(fill * 100)}%`, backgroundColor: cover }]} />}</View>
        <Text style={styles.teams} numberOfLines={1}>{`${FORMAT_LABELS[item.format] ?? item.format} · ${teams}`}</Text>
      </View>
    </TouchableOpacity>
  )
}

/**
 * Tournaments from the viewer's clubs (upcoming soonest first, past latest first), and on Upcoming
 * the ones run outside vteam (Schelagg's programs feed): around the viewer's city, then NAGVA
 * elsewhere in the state. Guests see the outside ones; club tournaments need an account.
 */
export default function TournamentsScreen() {
  const router = useRouter()
  const { userId, isGuest, loading: sessionLoading } = useSession()
  const requireSignIn = useRequireSignIn()
  // Upcoming / Past and the organizer chip are in the URL (`?view=past&host=NAGVA`).
  const [tab, setTab] = useUrlParam('view', VIEW.tournaments.view)
  const list = useTournamentList(userId)
  const [refreshing, setRefreshing] = useState(false)

  const split = useMemo(() => splitTournaments(list.data ?? [], new Date()), [list.data])
  const items = tab === 'upcoming' ? split.upcoming : split.past
  const programs = useExternalPrograms()
  // An outside tournament's sheet (#395): `?program=<id>`, what sharing one sends.
  const programSheet = useProgramSheet('tournaments')
  const region = useFeedRegion()
  const outside = tab === 'upcoming' ? programs.data : null
  const outsideAll = useMemo(() => [...(outside?.tournaments ?? []), ...(outside?.elsewhere ?? [])], [outside])
  const outsideCount = outsideAll.length
  const freeAgentCounts = useFreeAgentCounts(outsideAll.map(p => p.id))
  const [hostParam, setHostParam] = useUrlParam('host', VIEW.tournaments.host)
  const host = hostParam || null
  const setHost = (next: string | null) => setHostParam(next ?? '')
  const city = region.charAt(0).toUpperCase() + region.slice(1)
  const outsideNode = outsideCount ? (
    <View style={{ marginTop: theme.spacing.sm }}>
      <ProgramHostChips programs={outsideAll} host={host} onSelect={setHost} />
      <ProgramSection title={`Around ${city}`} programs={byHost(outside!.tournaments, host)} freeAgentCounts={freeAgentCounts} onOpen={programSheet.openProgram} testID="tournaments-around" />
      <ProgramSection title="Elsewhere in the state" programs={byHost(outside!.elsewhere, host)} freeAgentCounts={freeAgentCounts} onOpen={programSheet.openProgram} testID="tournaments-elsewhere" />
      <Text style={[shared.caption, { marginTop: theme.spacing.md }]}>{PROGRAMS_SOURCE_NOTE}</Text>
    </View>
  ) : null
  const outsideLoading = tab === 'upcoming' && programs.isLoading && !programs.data
    ? <Spinner label="Loading tournaments" style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primaryText} />
    : null
  const clubLoading = list.isLoading && !list.data
  const clubHeader = clubLoading ? (
    // Same space the rows will take, so nothing below moves when they arrive (#288).
    <ClubTournamentsSkeleton showHeader={tab === 'upcoming'} />
  ) : list.error && !list.data ? (
    <TouchableOpacity onPress={() => { void list.refetch({ force: true }) }} accessibilityRole="button" style={{ paddingVertical: theme.spacing.sm, minHeight: 44, justifyContent: 'center' }}>
      <Text style={shared.caption}>Couldn't load your clubs' tournaments. Tap to retry.</Text>
    </TouchableOpacity>
  ) : tab === 'upcoming' && items.length ? (
    // Shown whenever there are club tournaments on Upcoming, like its loading placeholder, so the list never gains a header after it painted.
    <Text accessibilityRole="header" style={shared.programSectionTitle}>Your clubs</Text>
  ) : null
  // Empty only once both lists have answered and neither has anything.
  const clubEmpty = !clubLoading && !list.error && !outsideNode && !outsideLoading ? (
    <EmptyState
      icon="trophy-outline"
      title={tab === 'upcoming' ? 'No upcoming tournaments' : 'No past tournaments'}
      body={tab === 'upcoming' ? 'Tournaments your clubs publish show up here.' : 'Finished tournaments and their podiums live here.'}
    />
  ) : null
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(routes.app()))

  async function refresh() {
    setRefreshing(true)
    try { await Promise.all([list.refetch({ force: true }), programs.refetch({ force: true })]) } finally { setRefreshing(false) }
  }

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenContainer>
        <ScreenHeader
          title="Tournaments"
          safeTop
          onBack={goBack}
          right={(
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <ShareLinkButton
                path={routes.tournaments({ view: tab, host: hostParam })}
                title="Volleyball tournaments on vteam"
                screen="tournaments"
                filtered={tab !== 'upcoming' || !!host}
                testID="tournaments-share-button"
              />
              {!isGuest && (
                <IconButton icon="add" label="Create a tournament" size={44} onPress={() => router.push(routes.tournamentCreate())} />
              )}
            </View>
          )}
        />
        {sessionLoading ? (
          // Until we know whether this is a guest, draw neither layout: guessing "signed in" then
          // switching to the guest prompt pushed the list down 40-100 px on reload (#387).
          <Spinner label="Loading tournaments" style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primaryText} />
        ) : isGuest ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }}>
            <EmptyState
              icon="trophy-outline"
              title="Sign in to see club tournaments"
              body="Tournaments on vteam are shared with club members."
              actionLabel="Sign in"
              onAction={() => { requireSignIn() }}
            />
            {outsideNode ?? outsideLoading}
          </ScrollView>
        ) : (
          <>
            <View style={styles.segments} role="tablist">
              {(['upcoming', 'past'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onPress={() => setTab(t)}
                  style={[styles.segment, tab === t && styles.segmentOn]}
                  testID={`tournaments-${t}`}
                >
                  <Text style={[styles.segmentText, tab === t && styles.segmentTextOn]}>
                    {t === 'upcoming' ? 'Upcoming' : 'Past'}{(t === 'upcoming' ? split.upcoming.length : split.past.length) ? ` ${t === 'upcoming' ? split.upcoming.length : split.past.length}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Club tournaments and outside ones load separately: outside tournaments never wait on the club list. */}
            <FlatList
              data={items}
              keyExtractor={t => t.id}
              renderItem={({ item }) => <TournamentRow item={item} onPress={() => router.push(routes.tournament(item.id))} />}
              ListHeaderComponent={(clubHeader) ?? undefined}
              ListEmptyComponent={(clubEmpty) ?? undefined}
              ListFooterComponent={(outsideNode ?? outsideLoading) ?? undefined}
              contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={theme.colors.primary} />}
              testID="tournaments-list"
            />
          </>
        )}
      </ScreenContainer>
      {programSheet.sheet}
    </View>
  )
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.card,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primaryText },
  segmentText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.base, color: theme.colors.subtext },
  segmentTextOn: { color: theme.colors.primaryText },
  card: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.card,
    marginBottom: theme.spacing.md,
    ...theme.shadow.card,
  },
  cover: { height: 92, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'space-between' },
  coverPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.full, backgroundColor: theme.colors.black + '33' },
  coverPillText: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.white },
  coverTitle: { fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, letterSpacing: -0.3, color: theme.colors.white },
  body: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 6 },
  meta: { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext },
  bar: { height: 6, borderRadius: theme.radius.full, backgroundColor: theme.colors.primarySoft, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: theme.radius.full },
  teams: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.text },
})
