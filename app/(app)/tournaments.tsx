import React, { useMemo, useState } from 'react'
import { FlatList, ScrollView, TouchableOpacity, View } from 'react-native'
import { Text } from '../../components/ui/Text'
import { Stack, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import { FORMAT_LABELS } from '../../constants/tournamentCopy'
import { useSession } from '../../contexts/session'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { useTournamentList } from '../../hooks/useTournamentList'
import { RefreshControl } from '../../components/RefreshControl'
import { TourneyStatusBadge } from '../../components/tournament/TournamentBits'
import { Chip, EmptyState, IconButton, ScreenContainer, ScreenHeader, Spinner } from '../../components/ui'
import { routes } from '../../utils/routes'
import { splitTournaments } from '../../utils/tournamentList'
import { ProgramSection } from '../../components/programs/ProgramSection'
import { useExternalPrograms } from '../../hooks/useExternalPrograms'
import { useFeedRegion } from '../../hooks/useUserSettings'
import { PROGRAMS_SOURCE_NOTE } from '../../constants/copy'
import { ProgramHostChips } from '../../components/programs/ProgramHostChips'
import { byHost } from '../../utils/externalPrograms'
import { ShareLinkButton } from '../../components/ShareLinkButton'
import { useUrlParam } from '../../hooks/useUrlParam'
import { VIEW } from '../../utils/urlViews'
import type { TournamentListItem } from '../../types'

type Tab = 'upcoming' | 'past'

// One row's layout, shared by the row and its loading placeholder so they are the same height (#288).
const ROW_STYLE = [shared.card, { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing.md, marginBottom: theme.spacing.sm, minHeight: 72 }]
const DATE_BLOCK_STYLE = { width: 52, alignItems: 'center' as const, paddingVertical: 6, borderRadius: theme.radius.md, backgroundColor: theme.colors.time, borderWidth: 1, borderColor: theme.colors.timeBorder }
const MONTH_STYLE = { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.timeInk, textTransform: 'uppercase' as const }
const DAY_STYLE = { fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: theme.colors.timeInk }
const TITLE_STYLE = { fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.text }
const META_STYLE = { fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext }
const SMALL_STYLE = { fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }
/** A blank line of text in a placeholder: the same font metrics as the real line, with a bar instead of words. */
const BLANK = '\u00a0'
/** About as long as a real format + teams line ("Pool Play + Bracket · 8/8 teams"). */
const TYPICAL_META = 'Pool Play + Bracket · 8/8 teams'

/**
 * The club tournaments while they load on a first visit (returning viewers have them from the
 * device): the section header and two rows in the final layout, so the outside tournaments below
 * don't get pushed down when they arrive.
 */
function ClubTournamentsSkeleton({ showHeader }: { showHeader: boolean }) {
  return (
    <View testID="tournaments-club-loading" accessibilityLabel="Loading club tournaments">
      {showHeader && <Text accessibilityRole="header" style={shared.programSectionTitle}>On vteam</Text>}
      {[0, 1].map(i => (
        <View key={i} style={ROW_STYLE} aria-hidden importantForAccessibility="no-hide-descendants">
          <View style={[DATE_BLOCK_STYLE, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <Text style={MONTH_STYLE}>{BLANK}</Text>
            <Text style={DAY_STYLE}>{BLANK}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ alignSelf: 'flex-start', width: '70%', borderRadius: theme.radius.sm, backgroundColor: theme.colors.border }}><Text style={TITLE_STYLE}>{BLANK}</Text></View>
            <View style={{ alignSelf: 'flex-start', width: '50%', borderRadius: theme.radius.sm, backgroundColor: theme.colors.borderSoft }}><Text style={META_STYLE}>{BLANK}</Text></View>
            {/* The real badge line wraps on narrow phones; the same badge and a typical line, hidden, wrap the same way. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              <View style={{ borderRadius: theme.radius.sm, backgroundColor: theme.colors.borderSoft }}><View style={{ opacity: 0 }}><TourneyStatusBadge status="published" /></View></View>
              <View style={{ borderRadius: theme.radius.sm, backgroundColor: theme.colors.borderSoft }}><Text style={[SMALL_STYLE, { opacity: 0 }]}>{TYPICAL_META}</Text></View>
            </View>
          </View>
          <View style={{ width: 18 }} />
        </View>
      ))}
    </View>
  )
}

function TournamentRow({ item, onPress }: { item: TournamentListItem; onPress: () => void }) {
  const d = new Date(item.start_date)
  const meta = [item.club_name, item.location].filter(Boolean).join(' · ')
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
      style={ROW_STYLE}
      testID={`tournament-row-${item.id}`}
    >
      <View style={DATE_BLOCK_STYLE}>
        <Text style={MONTH_STYLE}>
          {d.toLocaleDateString('en-US', { month: 'short' })}
        </Text>
        <Text style={DAY_STYLE}>{d.getDate()}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={1} style={TITLE_STYLE}>{item.title}</Text>
        {!!meta && <Text numberOfLines={1} style={META_STYLE}>{meta}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
          <TourneyStatusBadge status={item.status} />
          <Text style={SMALL_STYLE}>
            {FORMAT_LABELS[item.format] ?? item.format} · {item.team_count}{item.max_teams ? `/${item.max_teams}` : ''} teams
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
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
  const { userId, isGuest } = useSession()
  const requireSignIn = useRequireSignIn()
  // Upcoming / Past and the organizer chip are in the URL (`?view=past&host=NAGVA`).
  const [tab, setTab] = useUrlParam('view', VIEW.tournaments.view)
  const list = useTournamentList(userId)
  const [refreshing, setRefreshing] = useState(false)

  const split = useMemo(() => splitTournaments(list.data ?? [], new Date()), [list.data])
  const items = tab === 'upcoming' ? split.upcoming : split.past
  const programs = useExternalPrograms()
  const region = useFeedRegion()
  const outside = tab === 'upcoming' ? programs.data : null
  const outsideAll = useMemo(() => [...(outside?.tournaments ?? []), ...(outside?.elsewhere ?? [])], [outside])
  const outsideCount = outsideAll.length
  const [hostParam, setHostParam] = useUrlParam('host', VIEW.tournaments.host)
  const host = hostParam || null
  const setHost = (next: string | null) => setHostParam(next ?? '')
  const city = region.charAt(0).toUpperCase() + region.slice(1)
  const outsideNode = outsideCount ? (
    <View style={{ marginTop: theme.spacing.sm }}>
      <ProgramHostChips programs={outsideAll} host={host} onSelect={setHost} />
      <ProgramSection title={`Around ${city}`} programs={byHost(outside!.tournaments, host)} testID="tournaments-around" />
      <ProgramSection title="Elsewhere in the state" programs={byHost(outside!.elsewhere, host)} testID="tournaments-elsewhere" />
      <Text style={[shared.caption, { marginTop: theme.spacing.md }]}>{PROGRAMS_SOURCE_NOTE}</Text>
    </View>
  ) : null
  const outsideLoading = tab === 'upcoming' && programs.isLoading && !programs.data
    ? <Spinner label="Loading tournaments" style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primary} />
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
    <Text accessibilityRole="header" style={shared.programSectionTitle}>On vteam · {items.length}</Text>
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
        {isGuest ? (
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
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
              <Chip label="Upcoming" badge={split.upcoming.length || undefined} active={tab === 'upcoming'} onPress={() => setTab('upcoming')} testID="tournaments-upcoming" />
              <Chip label="Past" badge={split.past.length || undefined} active={tab === 'past'} onPress={() => setTab('past')} testID="tournaments-past" />
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
    </View>
  )
}
