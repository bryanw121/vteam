/*
-- Run in Supabase SQL editor:
-- (schema comments retained from prior clubs setup — see git history for full DDL)
*/

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text, TextInput } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Stack, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../../lib/supabase'
import { queryKey, useFocusRefetch, useQuery } from '../../../../lib/query'
import { useSession } from '../../../../contexts/session'
import { SignInButton } from '../../../../components/SignInButton'
import { ScreenHeader, ScreenState } from '../../../../components/ui'
import { CLUBS_TAB_INDEX, STALE, shared, theme } from '../../../../constants'
import { DocScrollView } from '../../../../components/DocScrollView'
import { useTabsActive, useTabsShell } from '../../../../contexts/tabs'
import { routes } from '../../../../utils/routes'
import { useUrlParam } from '../../../../hooks/useUrlParam'
import { VIEW } from '../../../../utils/urlViews'
import type { ClubListItem } from '../../../../types'
import { ClubRow, ClubTile, memberCount, resolvedMajorCity } from '../../../../components/club/ClubListParts'
import { useFeedCity } from '../../../../hooks/useFeedCity'

/** List payload: member count; membership embed is added when signed in. */
const CLUB_LIST_SELECT_BASE =
  'id, name, description, membership_type, created_by, avatar_url, cover_url, created_at, major_city_id, major_cities (id, display_name, city_name, admin_region, country_code), club_members(count)'

const CLUB_LIST_MY_MEMBERSHIP = 'my_membership:club_members(club_id, user_id, role, joined_at)'

const EMPTY_CLUBS: ClubListItem[] = []

export default function ClubsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { docScrollActive, tabBarHeight } = useTabsShell()
  const { activeTabIndex } = useTabsActive()
  const isActive = activeTabIndex === CLUBS_TAB_INDEX
  const { isGuest, userId, loading: sessionLoading } = useSession()
  const [refreshing, setRefreshing] = useState(false)
  // The search is in the URL (`/clubs?q=sand`) so a copied link opens it. (`filter` from older links is ignored.)
  const [linkQuery, setLinkQuery] = useUrlParam('q', VIEW.clubs.q, { tab: 'clubs' })
  const [searchQuery, setSearchQuery] = useState(linkQuery)
  // The list filters on every keystroke; the address catches up once typing pauses.
  const wroteQuery = useRef(linkQuery)
  useEffect(() => {
    if (searchQuery.trim() === linkQuery.trim()) return
    const t = setTimeout(() => { wroteQuery.current = searchQuery.trim(); setLinkQuery(searchQuery) }, 400)
    return () => clearTimeout(t)
  }, [searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps
  // A link opened while the tab is mounted (or Back) brings its own search; the address catching up with typing doesn't.
  useEffect(() => {
    if (linkQuery.trim() === wroteQuery.current) return
    wroteQuery.current = linkQuery.trim()
    setSearchQuery(linkQuery)
  }, [linkQuery])

  // One cache entry per viewer (membership flags depend on who is signed in).
  // Fetched when this page is the active tab, refetched on focus only when stale.
  const listKey = queryKey('clubs', userId)
  const clubsQuery = useQuery<ClubListItem[]>(
    listKey,
    async () => {
      let query = supabase
        .from('clubs')
        .select(userId ? `${CLUB_LIST_SELECT_BASE}, ${CLUB_LIST_MY_MEMBERSHIP}` : CLUB_LIST_SELECT_BASE)
        .order('created_at', { ascending: false })
      if (userId) query = query.eq('my_membership.user_id', userId)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as ClubListItem[]
    },
    { staleMs: STALE.feed, enabled: isActive && !sessionLoading },
  )
  useFocusRefetch(isActive && !sessionLoading ? listKey : null)
  const clubs = clubsQuery.data ?? EMPTY_CLUBS

  async function onRefresh() {
    setRefreshing(true)
    try {
      await clubsQuery.refetch({ force: true })
    } finally {
      setRefreshing(false)
    }
  }

  const city = useFeedCity()
  const myClubs = useMemo(() =>
    clubs.filter(c => (c.my_membership ?? []).some(m => m.user_id === userId)),
  [clubs, userId])

  // Clubs to join: the viewer's city first, then the biggest.
  const inCity = (c: ClubListItem) => resolvedMajorCity(c)?.city_name?.toLowerCase() === city.name.toLowerCase()
  const discover = useMemo(() =>
    clubs
      .filter(c => !(c.my_membership ?? []).some(m => m.user_id === userId))
      .sort((a, b) => Number(inCity(b)) - Number(inCity(a)) || memberCount(b) - memberCount(a)),
  [clubs, userId, city.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = searchQuery.trim().toLowerCase()
  function matchesSearch(c: ClubListItem): boolean {
    if (!q) return true
    const inName = c.name.toLowerCase().includes(q)
    const mc = resolvedMajorCity(c)
    const inRegion = !!mc && (
      mc.display_name.toLowerCase().includes(q)
      || mc.city_name.toLowerCase().includes(q)
      || (mc.admin_region ?? '').toLowerCase().includes(q)
    )
    return inName || inRegion
  }

  function isOwner(club: ClubListItem): boolean {
    return (club.my_membership ?? []).some(m => m.user_id === userId && m.role === 'owner')
  }

  function isMember(club: ClubListItem): boolean {
    return (club.my_membership ?? []).some(m => m.user_id === userId)
  }

  const visibleClubs = q ? clubs.filter(matchesSearch) : discover

  const listHeader = (
    <>
      {/* The same ScreenHeader as Events and Chat, so the title doesn't jump between tabs */}
      <ScreenHeader
        title="Clubs"
        right={isGuest ? <SignInButton /> : (
        <TouchableOpacity
          onPress={() => router.push(routes.clubCreate())}
          accessibilityRole="button"
          accessibilityLabel="Create a new club"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.primary,
          }}
        >
          <Ionicons name="add" size={20} color={theme.colors.white} />
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.smd, color: theme.colors.white }}>Create</Text>
        </TouchableOpacity>
        )}
      />

      <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.full,
          paddingHorizontal: 16,
          paddingVertical: 10,
          minHeight: 48,
        }}>
          <Ionicons name="search-outline" size={18} color={theme.colors.subtext} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Find a club by name or city"
            placeholderTextColor={theme.colors.subtext}
            style={{
              flex: 1,
              // A web <input> keeps an intrinsic width (~20 characters) unless allowed to shrink;
              // at Extra large text on a 320px phone that pushed the page sideways.
              minWidth: 0,
              fontFamily: theme.fonts.body,
              fontSize: theme.font.size.base,
              color: theme.colors.text,
              padding: 0,
            }}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>
      {!q && myClubs.length > 0 && (
        <>
          <Text style={styles.section} accessibilityRole="header">Your clubs</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles} testID="your-clubs">
            {myClubs.map(club => (
              <ClubTile key={club.id} club={club} owner={isOwner(club)} onPress={() => router.push(routes.club(club.id))} />
            ))}
          </ScrollView>
        </>
      )}
      {(q || discover.length > 0) && (
        <Text style={styles.section} accessibilityRole="header">
          {q ? 'Results' : myClubs.length > 0 ? `More clubs near ${city.name}` : `Popular near ${city.name}`}
        </Text>
      )}
    </>
  )

  const emptyBody = (
    <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl, marginHorizontal: theme.spacing.lg }]}>
      <Ionicons name="people-outline" size={48} color={theme.colors.subtext} />
      <Text style={[shared.caption, { textAlign: 'center', maxWidth: 260 }]}>
        {searchQuery.trim()
          ? 'No clubs match your search.'
          : clubs.length > 0 ? "You're in every club so far. Start your own with Create." : 'No clubs yet. Start one with Create.'}
      </Text>
    </View>
  )

  return (
    <View style={[shared.screen, { paddingTop: insets.top }, docScrollActive && ({ flex: undefined } as any)]}>
      <Stack.Screen options={{ headerShown: false }} />

      {!clubsQuery.data ? (
        <>
          {listHeader}
          <ScreenState
            loading={clubsQuery.isFetching || !clubsQuery.error}
            error={clubsQuery.error ? 'Could not load clubs. Check your connection and try again.' : null}
            onRetry={() => void clubsQuery.refetch({ force: true })}
          />
        </>
      ) : docScrollActive ? (
        <DocScrollView
          docScroll
          memoryKey="tab:clubs"
          style={shared.screen}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.primary} />}
        >
          {listHeader}
          {visibleClubs.length === 0
            ? emptyBody
            : visibleClubs.map(club => (
              <View key={club.id} style={{ paddingHorizontal: theme.spacing.lg }}>
                <ClubRow
                  club={club}
                  userId={userId}
                  listKey={listKey}
                  isOwner={isOwner(club)}
                  isMember={isMember(club)}
                  onPress={() => router.push(routes.club(club.id))}
                />
              </View>
            ))}
        </DocScrollView>
      ) : (
        <FlatList
          data={visibleClubs}
          keyExtractor={c => c.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primaryText]}
            />
          }
          ListEmptyComponent={emptyBody}
          renderItem={({ item: club }) => (
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ClubRow
                club={club}
                userId={userId}
                listKey={listKey}
                isOwner={isOwner(club)}
                isMember={isMember(club)}
                onPress={() => router.push(routes.club(club.id))}
              />
            </View>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.size.lg,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  tiles: { gap: 12, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xs },
})
