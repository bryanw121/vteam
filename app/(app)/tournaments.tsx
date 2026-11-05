import React, { useMemo, useState } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
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
import { Chip, EmptyState, IconButton, ScreenContainer, ScreenHeader, ScreenState } from '../../components/ui'
import { routes } from '../../utils/routes'
import { splitTournaments } from '../../utils/tournamentList'
import type { TournamentListItem } from '../../types'

type Tab = 'upcoming' | 'past'

function TournamentRow({ item, onPress }: { item: TournamentListItem; onPress: () => void }) {
  const d = new Date(item.start_date)
  const meta = [item.club_name, item.location].filter(Boolean).join(' · ')
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
      style={[shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm, minHeight: 72 }]}
      testID={`tournament-row-${item.id}`}
    >
      <View style={{ width: 52, alignItems: 'center', paddingVertical: 6, borderRadius: theme.radius.md, backgroundColor: theme.colors.time, borderWidth: 1, borderColor: theme.colors.timeBorder }}>
        <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, color: theme.colors.timeInk, textTransform: 'uppercase' }}>
          {d.toLocaleDateString('en-US', { month: 'short' })}
        </Text>
        <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: theme.colors.timeInk }}>{d.getDate()}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.displaySemiBold, fontSize: theme.font.size.lgs, color: theme.colors.text }}>{item.title}</Text>
        {!!meta && <Text numberOfLines={1} style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{meta}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
          <TourneyStatusBadge status={item.status} />
          <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
            {FORMAT_LABELS[item.format] ?? item.format} · {item.team_count}{item.max_teams ? `/${item.max_teams}` : ''} teams
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.subtext} />
    </TouchableOpacity>
  )
}

/** Tournaments from the viewer's clubs: upcoming (soonest first) and past (latest first). */
export default function TournamentsScreen() {
  const router = useRouter()
  const { userId, isGuest } = useSession()
  const requireSignIn = useRequireSignIn()
  const [tab, setTab] = useState<Tab>('upcoming')
  const list = useTournamentList(userId)
  const [refreshing, setRefreshing] = useState(false)

  const split = useMemo(() => splitTournaments(list.data ?? [], new Date()), [list.data])
  const items = tab === 'upcoming' ? split.upcoming : split.past
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(routes.app()))

  async function refresh() {
    setRefreshing(true)
    try { await list.refetch({ force: true }) } finally { setRefreshing(false) }
  }

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenContainer>
        <ScreenHeader
          title="Tournaments"
          safeTop
          onBack={goBack}
          right={!isGuest ? (
            <IconButton icon="add" label="Create a tournament" size={44} onPress={() => router.push(routes.tournamentCreate())} />
          ) : undefined}
        />
        {isGuest ? (
          <EmptyState
            icon="trophy-outline"
            title="Sign in to see tournaments"
            body="Tournaments are shared with club members."
            actionLabel="Sign in"
            onAction={() => { requireSignIn() }}
          />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
              <Chip label="Upcoming" badge={split.upcoming.length || undefined} active={tab === 'upcoming'} onPress={() => setTab('upcoming')} testID="tournaments-upcoming" />
              <Chip label="Past" badge={split.past.length || undefined} active={tab === 'past'} onPress={() => setTab('past')} testID="tournaments-past" />
            </View>
            <ScreenState
              loading={list.isLoading}
              ready={!!list.data}
              error={list.error && !list.data ? "Couldn't load tournaments." : null}
              onRetry={() => { void list.refetch({ force: true }) }}
              empty={items.length === 0}
              emptyIcon="trophy-outline"
              emptyTitle={tab === 'upcoming' ? 'No upcoming tournaments' : 'No past tournaments'}
              emptyBody={tab === 'upcoming' ? 'Tournaments your clubs publish show up here.' : 'Finished tournaments and their podiums live here.'}
            >
              <FlatList
                data={items}
                keyExtractor={t => t.id}
                renderItem={({ item }) => <TournamentRow item={item} onPress={() => router.push(routes.tournament(item.id))} />}
                contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={theme.colors.primary} />}
              />
            </ScreenState>
          </>
        )}
      </ScreenContainer>
    </View>
  )
}
