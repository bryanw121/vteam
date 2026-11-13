import React, { useEffect, useRef, useState } from 'react'
import { Platform, ScrollView, TouchableOpacity, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, TextInput } from '../../components/ui/Text'
import { Chip, EmptyState, ScreenContainer, ScreenHeader, Spinner } from '../../components/ui'
import { EventCard } from '../../components/EventCard'
import { ExternalSessionCard } from '../../components/ExternalSessionCard'
import { shared, theme } from '../../constants'
import { ANALYTICS_EVENTS } from '../../constants/analytics'
import { useSession } from '../../contexts/session'
import { useSearch } from '../../hooks/useSearch'
import { useRecentSearches } from '../../hooks/useRecentSearches'
import { useFeedRegion } from '../../hooks/useUserSettings'
import { useUrlParam } from '../../hooks/useUrlParam'
import { track } from '../../lib/analytics'
import { profileDisplayName } from '../../utils'
import { routes } from '../../utils/routes'
import { VIEW } from '../../utils/urlViews'
import { SEARCH_MAX_CHARS, isSearchable, searchResultCount } from '../../utils/search'
import type { SearchClubRowProps, SearchHostRowProps, SearchScope } from '../../types'

/**
 * Search (#176): upcoming games (vteam and other venues), hosts with upcoming
 * games and clubs; signed-in players can also search their own past games.
 * Public. The query and scope are in the URL (`/search?q=zilker`), so a link
 * opens the same search and Back restores it.
 */
export default function SearchScreen() {
  const router = useRouter()
  const { userId } = useSession()
  const region = useFeedRegion()
  const [qParam, setQParam] = useUrlParam('q', VIEW.search.q)
  const [scopeParam, setScopeParam] = useUrlParam('scope', VIEW.search.scope)
  const scope: SearchScope = userId ? scopeParam : 'upcoming'
  const [text, setText] = useState(qParam)
  const search = useSearch(text, scope, region)
  const { recent, remember, clear } = useRecentSearches()
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null)
  const results = search.data
  const total = results ? searchResultCount(results) : 0

  // A link or Back with ?q= fills the box.
  useEffect(() => { if (qParam && qParam !== text.trim()) setText(qParam) }, [qParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // The settled text goes into the address (replace, not push), and is counted once per search.
  useEffect(() => {
    if (search.q !== qParam) setQParam(search.q)
  }, [search.q]) // eslint-disable-line react-hooks/exhaustive-deps
  const counted = useRef('')
  useEffect(() => {
    if (!results || !search.enabled) return
    const key = `${scope}:${search.q.toLowerCase()}`
    if (counted.current === key) return
    counted.current = key
    track(ANALYTICS_EVENTS.searchSubmitted, { len: search.q.length, scope, results: searchResultCount(results) })
  }, [results, search.enabled, search.q, scope])

  // Desktop web: `/` focuses the box, Esc clears it.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === '/' && !typing) { e.preventDefault(); inputRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function choose(q: string) {
    setText(q)
    remember(q)
  }

  /** Opening a result (or leaving with results on screen) remembers what found it. */
  function opened() {
    if (search.enabled) remember(search.q)
  }
  const lastFound = useRef('')
  lastFound.current = search.enabled && total > 0 ? search.q : ''
  useEffect(() => () => { if (lastFound.current) remember(lastFound.current) }, [remember])

  const showRecent = !isSearchable(text) && recent.length > 0

  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenContainer>
        <ScreenHeader
          title="Search"
          safeTop
          onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.app()))}
        />
        <View style={{ paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm }}>
          <View style={shared.searchField}>
            <Ionicons name="search-outline" size={18} color={theme.colors.subtext} />
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => { if (isSearchable(text)) remember(text) }}
              placeholder="Games, places, hosts, clubs"
              placeholderTextColor={theme.colors.subtext}
              style={shared.searchFieldInput}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              maxLength={SEARCH_MAX_CHARS}
              accessibilityLabel="Search"
              testID="search-input"
              onKeyPress={e => { if (Platform.OS === 'web' && (e.nativeEvent as { key?: string }).key === 'Escape') setText('') }}
            />
            {text ? (
              <TouchableOpacity onPress={() => { setText(''); inputRef.current?.focus() }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear search" testID="search-clear">
                <Ionicons name="close-circle" size={18} color={theme.colors.subtext} />
              </TouchableOpacity>
            ) : null}
          </View>
          {userId ? (
            <View style={shared.chipRowWrap} role="radiogroup" aria-label="What to search">
              <Chip label="Upcoming" role="radio" active={scope === 'upcoming'} onPress={() => setScopeParam('upcoming')} testID="search-scope-upcoming" />
              <Chip label="Past games I played" role="radio" active={scope === 'mine_past'} onPress={() => setScopeParam('mine_past')} testID="search-scope-mine_past" />
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }} keyboardShouldPersistTaps="handled">
          {showRecent ? (
            <View testID="search-recent" style={{ marginTop: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={shared.subheading}>Recent</Text>
                <TouchableOpacity onPress={clear} hitSlop={12} accessibilityRole="button">
                  <Text style={shared.emptyStateAction}>Clear</Text>
                </TouchableOpacity>
              </View>
              {recent.map(r => (
                <TouchableOpacity key={r} onPress={() => choose(r)} style={shared.searchRecentRow} accessibilityRole="button" accessibilityLabel={`Search ${r}`}>
                  <Ionicons name="time-outline" size={16} color={theme.colors.subtext} />
                  <Text style={shared.body} numberOfLines={1}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {!isSearchable(text) && !showRecent ? (
            <EmptyState icon="search-outline" title="Find a game, place, host or club" body={'Try a venue ("Zilker"), a game name or a host.'} testID="search-start" />
          ) : null}

          {search.enabled && search.isLoading && !results ? <View style={{ paddingVertical: theme.spacing.xl }}><Spinner label="Searching" /></View> : null}

          {search.error && !results ? (
            <EmptyState icon="cloud-offline-outline" title="Couldn't search right now." actionLabel="Try again" onAction={() => { void search.refetch({ force: true }) }} testID="search-error" />
          ) : null}

          {results && search.enabled && total === 0 && !search.settling ? (
            <EmptyState
              icon="search-outline"
              title={`Nothing matches "${search.q}"`}
              body={scope === 'mine_past' ? 'Only games you played in the last year are searched here.' : 'Upcoming games in the next 60 days, hosts with games coming up, and clubs are searched.'}
              testID="search-empty"
            />
          ) : null}

          {results && search.enabled ? (
            <>
              {results.events.length + results.external.length > 0 ? (
                <View testID="search-games" style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
                  <Text style={shared.subheading}>{scope === 'mine_past' ? 'Past games' : 'Games'}</Text>
                  {results.events.map(e => <EventCard key={e.id} event={e} currentUserId={userId ?? undefined} />)}
                  {results.external.map(x => <ExternalSessionCard key={x.id} session={x} />)}
                </View>
              ) : null}
              {results.hosts.length > 0 ? (
                <View testID="search-hosts" style={{ marginTop: theme.spacing.lg }}>
                  <Text style={shared.subheading}>Hosts</Text>
                  {results.hosts.map(h => <HostRow key={h.id} host={h} onPress={() => { opened(); router.push(routes.profileOf(h.id)) }} />)}
                </View>
              ) : null}
              {results.clubs.length > 0 ? (
                <View testID="search-clubs" style={{ marginTop: theme.spacing.lg }}>
                  <Text style={shared.subheading}>Clubs</Text>
                  {results.clubs.map(c => <ClubRow key={c.id} club={c} onPress={() => { opened(); router.push(routes.club(c.id)) }} />)}
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </ScreenContainer>
    </View>
  )
}

function HostRow({ host, onPress }: SearchHostRowProps) {
  const name = profileDisplayName(host)
  return (
    <TouchableOpacity onPress={onPress} style={shared.searchResultRow} accessibilityRole="link" accessibilityLabel={`${name}, ${host.upcoming} upcoming`} testID={`search-host-${host.id}`}>
      <Ionicons name="person-circle-outline" size={28} color={theme.colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={shared.body} numberOfLines={1}>{name}</Text>
        <Text style={shared.caption}>{host.upcoming === 1 ? '1 upcoming game' : `${host.upcoming} upcoming games`}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
    </TouchableOpacity>
  )
}

function ClubRow({ club, onPress }: SearchClubRowProps) {
  const meta = [club.location_name, club.members === 1 ? '1 member' : `${club.members} members`].filter(Boolean).join(' · ')
  return (
    <TouchableOpacity onPress={onPress} style={shared.searchResultRow} accessibilityRole="link" accessibilityLabel={`${club.name}, ${meta}`} testID={`search-club-${club.id}`}>
      <Ionicons name="people-circle-outline" size={28} color={theme.colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={shared.body} numberOfLines={1}>{club.name}</Text>
        <Text style={shared.caption} numberOfLines={1}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
    </TouchableOpacity>
  )
}
