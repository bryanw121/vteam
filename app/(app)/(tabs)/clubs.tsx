/*
-- Run in Supabase SQL editor:
-- (schema comments retained from prior clubs setup — see git history for full DDL)
*/

import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native'
import { Text, TextInput } from '../../../components/ui/Text'
import { RefreshControl } from '../../../components/RefreshControl'
import { Image } from 'expo-image'
import Ionicons from '@expo/vector-icons/Ionicons'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { queryKey, setQueryData, useFocusRefetch, useMutation, useQuery } from '../../../lib/query'
import { useSession } from '../../../contexts/session'
import { useRequireSignIn } from '../../../hooks/useRequireSignIn'
import { SignInButton } from '../../../components/SignInButton'
import { ScreenState } from '../../../components/ui'
import { CLUBS_TAB_INDEX, STALE, shared, theme } from '../../../constants'
import { DocScrollView } from '../../../components/DocScrollView'
import { useTabsActive, useTabsShell } from '../../../contexts/tabs'
import { resolveClubAvatarUri } from '../../../utils'
import { routes } from '../../../utils/routes'
import type { ClubListItem, MajorCity } from '../../../types'

/** List payload: member count; membership embed is added when signed in. */
const CLUB_LIST_SELECT_BASE =
  'id, name, description, membership_type, created_by, avatar_url, cover_url, created_at, major_city_id, major_cities (id, display_name, city_name, admin_region, country_code), club_members(count)'

const CLUB_LIST_MY_MEMBERSHIP = 'my_membership:club_members(club_id, user_id, role, joined_at)'

/** PostgREST usually returns one embedded row as an object; normalize if it ever comes back as a single-element array. */
function resolvedMajorCity(c: ClubListItem): MajorCity | null {
  const raw = c.major_cities as unknown
  if (raw == null) return null
  if (Array.isArray(raw)) return (raw[0] as MajorCity | undefined) ?? null
  return raw as MajorCity
}

function memberCount(club: ClubListItem): number {
  return Number(club.club_members?.[0]?.count ?? 0)
}

/** Deterministic color for a club based on its name */
function clubColor(name: string): string {
  const PALETTE = [
    theme.colors.primary, theme.colors.warm, theme.colors.cool,
    theme.colors.hot, theme.colors.accent, '#8B5CF6', '#0EA5E9', '#10B981',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return PALETTE[Math.abs(h) % PALETTE.length]
}

/** Replace one club in the cached list (optimistic join/rollback). */
function replaceClubInList(listKey: string, club: ClubListItem): void {
  setQueryData<ClubListItem[]>(listKey, prev => (prev ?? []).map(c => (c.id === club.id ? club : c)))
}

type ClubCardProps = {
  club: ClubListItem
  /** The signed-in viewer, or null for a guest. */
  userId: string | null
  /** Cache key of the list this card is in (the join updates it optimistically). */
  listKey: string
  isOwner: boolean
  isMember: boolean
  onPress: () => void
}

function ClubCard({ club, userId, listKey, isOwner, isMember, onPress }: ClubCardProps) {
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const requireSignIn = useRequireSignIn()
  const count = memberCount(club)
  const initial = club.name.charAt(0).toUpperCase()
  const color = clubColor(club.name)

  // One mutation per card, so joining two clubs in a row never drops the second tap.
  const join = useMutation<string, void>(
    async uid => {
      const { error } = await supabase.from('club_members').insert({ club_id: club.id, user_id: uid, role: 'member' })
      if (error) throw error
    },
    {
      onMutate: uid => {
        const before = club
        replaceClubInList(listKey, {
          ...club,
          club_members: [{ count: memberCount(club) + 1 }],
          my_membership: [{ club_id: club.id, user_id: uid, role: 'member', joined_at: new Date().toISOString() }],
        })
        return () => replaceClubInList(listKey, before)
      },
      onError: error => Alert.alert('Could not join', error.message),
      // The club's own page lists its members and posts.
      invalidates: [queryKey('club', club.id)],
    },
  )

  useEffect(() => {
    let cancelled = false
    resolveClubAvatarUri(club.avatar_url).then(uri => {
      if (!cancelled) setAvatarUri(uri)
    })
    return () => { cancelled = true }
  }, [club.avatar_url])

  function handleJoinPress(e: { stopPropagation?: () => void }) {
    e.stopPropagation?.()
    if (!userId) { requireSignIn(); return }
    void join.mutate(userId)
  }

  return (
    <TouchableOpacity
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 10,
        backgroundColor: theme.colors.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 14,
        overflow: 'hidden',
      }}
      onPress={onPress}
      activeOpacity={0.72}
    >
      <View style={{ width: 54, height: 54, borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={{ width: 54, height: 54 }} contentFit="cover" transition={150} />
        ) : (
          <LinearGradient
            colors={[color, color + 'BB', color + '77'] as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 54, height: 54, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.xl, color: theme.colors.white, textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
              {initial}
            </Text>
          </LinearGradient>
        )}
      </View>

      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.size.base, letterSpacing: -0.3, color: theme.colors.text }} numberOfLines={1}>
          {club.name}
        </Text>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.sm, color: theme.colors.subtext }} numberOfLines={1}>
          {resolvedMajorCity(club)?.display_name ?? 'Unknown'} · {count} members{isOwner ? ' · Owner' : ''}
        </Text>
      </View>

      {isMember ? (
        <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.colors.cool + '20' }}>
          <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.cool }}>✓ Joined</Text>
        </View>
      ) : (
        <TouchableOpacity
          onPress={handleJoinPress}
          disabled={join.isPending}
          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.colors.primary, opacity: join.isPending ? 0.6 : 1 }}
        >
          {join.isPending
            ? <ActivityIndicator size="small" color={theme.colors.white} />
            : <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: theme.colors.white }}>Join</Text>
          }
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

type ClubFilter = 'joined' | 'nearby' | 'popular'

const EMPTY_CLUBS: ClubListItem[] = []

export default function ClubsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { docScrollActive, tabBarHeight } = useTabsShell()
  const { activeTabIndex } = useTabsActive()
  const isActive = activeTabIndex === CLUBS_TAB_INDEX
  const { isGuest, userId, loading: sessionLoading } = useSession()
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<ClubFilter>('joined')
  // Guests have no joined clubs, so show them Popular. An effect, not the initial
  // state: on a direct load the screen can mount before the session has loaded.
  useEffect(() => {
    if (isGuest) setFilter(f => (f === 'joined' ? 'popular' : f))
  }, [isGuest])
  const [searchQuery, setSearchQuery] = useState('')

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

  const myClubs = useMemo(() =>
    clubs.filter(c => (c.my_membership ?? []).some(m => m.user_id === userId)),
  [clubs, userId])

  const discoverClubs = useMemo(() =>
    clubs.filter(c => !(c.my_membership ?? []).some(m => m.user_id === userId)),
  [clubs, userId])

  const discoverOrdered = useMemo(() =>
    filter === 'popular'
      ? [...discoverClubs].sort((a, b) => memberCount(b) - memberCount(a))
      : discoverClubs,
  [discoverClubs, filter])

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

  const baseList = filter === 'joined' ? myClubs : discoverOrdered
  const visibleClubs = (q ? clubs : baseList).filter(matchesSearch)

  const listHeader = (
    <>
      <View style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: 4,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
      }}>
        <Text style={{ fontFamily: theme.fonts.display, fontSize: theme.font.heading.xxl, letterSpacing: -1.2, color: theme.colors.text, lineHeight: 38, flex: 1 }}>
          Clubs
        </Text>
        {isGuest ? <SignInButton /> : (
        <TouchableOpacity
          onPress={() => router.push(routes.clubCreate())}
          accessibilityRole="button"
          accessibilityLabel="Create a new club"
          style={{
            marginTop: 6,
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
      </View>

      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm }}>
        {([
          { id: 'joined',  label: 'Joined' },
          { id: 'nearby',  label: 'Near me' },
          { id: 'popular', label: 'Popular' },
        ] as const).map(f => {
          const active = filter === f.id
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7,
                borderRadius: theme.radius.full,
                backgroundColor: active ? theme.colors.primary : theme.colors.card,
                borderWidth: active ? 0 : 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.sm, color: active ? theme.colors.white : theme.colors.text }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: theme.colors.card,
        }}>
          <Ionicons name="search-outline" size={18} color={theme.colors.subtext} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search all clubs by name or city…"
            placeholderTextColor={theme.colors.subtext}
            style={{
              flex: 1,
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
    </>
  )

  const emptyBody = (
    <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xl, marginHorizontal: theme.spacing.lg }]}>
      <Ionicons name="people-outline" size={48} color={theme.colors.subtext} />
      <Text style={[shared.caption, { textAlign: 'center', maxWidth: 260 }]}>
        {searchQuery.trim()
          ? 'No clubs match your search.'
          : filter === 'joined'
          ? "You haven't joined any clubs yet."
          : filter === 'nearby'
          ? discoverClubs.length > 0 ? "No clubs match this view — try another filter or search." : "No clubs yet. Check back soon!"
          : clubs.length > 0 ? "You're in all available clubs!" : "No clubs yet. Check back soon!"}
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
                <ClubCard
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
              colors={[theme.colors.primary]}
            />
          }
          ListEmptyComponent={emptyBody}
          renderItem={({ item: club }) => (
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ClubCard
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
