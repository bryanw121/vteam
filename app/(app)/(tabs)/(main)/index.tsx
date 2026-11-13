import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'expo-router'
import { Dimensions, Platform, View, ScrollView, SectionList, TouchableOpacity, StyleSheet } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { DocPullToRefresh, RefreshControl } from '../../../../components/RefreshControl'
import { DocScrollView } from '../../../../components/DocScrollView'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useFeedRsvp, useMonthEvents } from '../../../../hooks/useMonthEvents'
import { useDocScrollMemory } from '../../../../hooks/useDocScrollMemory'
import { useNotifications } from '../../../../hooks/useNotifications'
import { useIsNarrowWeb } from '../../../../hooks/useIsNarrowWeb'
import { useFriendsGoing } from '../../../../hooks/useFriendsGoing'
import { EventCard, RowEventCard } from '../../../../components/EventCard'
import type { EventCardRsvpHandler } from '../../../../types'
import { MyEventsRail } from '../../../../components/MyEventsRail'
import { ExternalSessionCard } from '../../../../components/ExternalSessionCard'
import { EventsHeader } from '../../../../components/events/EventsHeader'
import { FilterChips } from '../../../../components/events/FilterChips'
import { SurfaceFilter } from '../../../../components/events/SurfaceFilter'
import { FeedEmpty } from '../../../../components/events/FeedEmpty'
import { AllTournamentsLink } from '../../../../components/events/AllTournamentsLink'
import { LeaguesLink } from '../../../../components/events/LeaguesLink'
import { ExternalProgramCard } from '../../../../components/ExternalProgramCard'
import { useExternalPrograms } from '../../../../hooks/useExternalPrograms'
import { normalizeProgramTournaments } from '../../../../utils/feedItems'
import { NextUpCard } from '../../../../components/events/NextUpCard'
import { IconButton } from '../../../../components/ui'
import { myStatusFor, useMyUpcomingEvents } from '../../../../hooks/useMyUpcomingEvents'
import { NotificationPopup } from '../../../../components/NotificationPopup'
import { BANNERS, BREAKPOINTS, FEED_STALE_NOTICE, TIGHT_TEXT_SCALE, TOUR_TARGETS, shared, theme } from '../../../../constants'
import { track } from '../../../../lib/analytics'
import { ANALYTICS_EVENTS } from '../../../../constants/analytics'
import { TourTarget } from '../../../../components/tour/TourTarget'
import { useTourWants } from '../../../../contexts/tour'
import { OneTimeBanner } from '../../../../components/ui'
import { useFeedRegion } from '../../../../hooks/useUserSettings'
import type { EventWithDetails, FeedFilter, FeedFilterChip, HiddenFeedEntry, HideFeedOption, NotificationItem, StoredFeedFilters, SurfaceFilter as SurfaceFilterValue } from '../../../../types'
import { DEFAULT_FEED_FILTERS, feedFiltersNow, loadFeedFilters, saveFeedFilters } from '../../../../utils/feedFilters'
import { useUrlParam } from '../../../../hooks/useUrlParam'
import { feedDay } from '../../../../utils/urlState'
import { VIEW } from '../../../../utils/urlViews'
import { useTabsShell } from '../../../../contexts/tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../../../../contexts/session'
import { useRequireSignIn } from '../../../../hooks/useRequireSignIn'
import { SignInButton } from '../../../../components/SignInButton'
import { addMonths } from '../../../../utils/monthKeys'
import { routes, isAppPath, toRoute } from '../../../../utils/routes'
import { dayLabel, eventLocalDateKey, localDateKey, surfaceOf } from '../../../../utils'
import { useToday } from '../../../../hooks/useToday'
import { useAdsEnabled } from '../../../../hooks/useAdsEnabled'
import { useFeedAds } from '../../../../hooks/useFeedAds'
import { useFeedForecasts } from '../../../../hooks/useForecast'
import { planFeedAds } from '../../../../utils/feedAds'
import { FeedBanner } from '../../../../components/ads/FeedBanner'
import { SponsoredLabel } from '../../../../components/ads/SponsoredLabel'
import { Spinner } from '../../../../components/ui/Spinner'
import { toast } from '../../../../lib/toast'
import { FeedItemShell, HiddenCountRow, HideFeedSheet } from '../../../../components/events/FeedHiding'
import { useHiddenFeed } from '../../../../hooks/useHiddenFeed'
import { hiddenIndex, hideOptions, isHidden, matchingEntries } from '../../../../utils/hiddenFeed'
import { ShareLinkButton } from '../../../../components/ShareLinkButton'
import { MonthGridContent, WeekPager, weekNavStyles } from '../../../../components/events/CalendarPagers'
import { buildMarkedDates, getWeekStart, idxForMonth, idxForWeek, monthForIdx, weekForIdx, WEEK_CENTER } from '../../../../utils/calendarWeeks'

// No "Mine" chip: the games a player is going to or hosting are already in the
// "You're going" rail above the feed.
const FILTER_CHIPS: FeedFilterChip[] = [
  { id: 'all',        label: 'All'        },
  { id: 'open_play',  label: 'Open Play'  },
  { id: 'tournament', label: 'Tournament' },
]

/** One day of the feed. `hiddenCount` counts that day's hidden items; `revealed` = they're shown (dimmed) in `data`. */
type DateSection = { date: string; data: EventWithDetails[]; hiddenCount: number; revealed: boolean }
export default function EventsScreen() {
  const router = useRouter()
  const { events, loading, error, loadMonth, loadMonthSpan, refresh, loadedMonths, reachedEnd } = useMonthEvents()
  const { rsvp, isPending: isRsvpPending } = useFeedRsvp()
  const {
    notifications: notifItems,
    unreadCount,
    refetch: refetchNotifs,
    markRead,
    markAllRead,
    loading: notifLoading,
  } = useNotifications({ fetchListOnMount: false })
  const { pagerBlocked, setTabBarHidden, tabBarHeight, eventsRefreshTick, docScrollActive } = useTabsShell()
  // Native is always the mobile layout; web flips at the sidebar breakpoint.
  const narrowWeb = useIsNarrowWeb(BREAKPOINTS.sidebar)
  const isMobile = Platform.OS !== 'web' || narrowWeb
  const insets = useSafeAreaInsets()

  const today = useToday()
  // The view is in the URL (`/?type=tournament&surface=sand&day=2026-11-14`, utils/urlViews) so a
  // copied link opens it. A link's filters show for that visit only; without them the
  // filters remembered on this device (utils/feedFilters) are used and written to the address.
  const [linkDay, setUrlDay] = useUrlParam('day', VIEW.feed.day, { tab: 'events' })
  const [selectedDate, setSelectedDate] = useState<string>(() => feedDay(linkDay, today) ?? today)
  const [chosenFilter, setChosenFilter, typeInLink] = useUrlParam('type', VIEW.feed.type, {
    tab: 'events', fallback: () => feedFiltersNow()?.filter ?? DEFAULT_FEED_FILTERS.filter,
  })
  const [surfaceFilter, setSurfaceFilter, surfaceInLink] = useUrlParam('surface', VIEW.feed.surface, {
    tab: 'events', fallback: () => feedFiltersNow()?.surface ?? DEFAULT_FEED_FILTERS.surface,
  })
  const feedRegion = useFeedRegion()
  // What this player hid from the feed (Settings → Hidden in feed). Days (mobile)
  // or months (desktop) in `revealedKeys` show their hidden items, dimmed.
  const hiddenFeed = useHiddenFeed()
  const hiddenIdx = useMemo(() => hiddenIndex(hiddenFeed.entries), [hiddenFeed.entries])
  const [revealedKeys, setRevealedKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [hideTarget, setHideTarget] = useState<EventWithDetails | null>(null)
  // "Hidden: …" with Undo (shared toast, #228).
  const showHideToast = (message: string, undo: HiddenFeedEntry[]) => {
    toast.show({ message, variant: 'info', duration: 5000, action: { label: 'Undo', onPress: () => hiddenFeed.restore(undo) } })
  }
  const [notifOpen, setNotifOpen] = useState(false)
  const [curWeekPage, setCurWeekPage] = useState(() => idxForWeek(getWeekStart(new Date(selectedDate + 'T00:00:00'))))
  const [curMonthPage, setCurMonthPage] = useState(() => idxForMonth(selectedDate.substring(0, 7)))
  const [eventsPullRefreshing, setEventsPullRefreshing] = useState(false)
  const { userId: currentUserId, isGuest } = useSession()
  const requireSignIn = useRequireSignIn()
  // "You're going" rail. Derived from events already in memory — no extra query
  // on the happy path, and it re-derives whenever the feed does, so an RSVP made
  // from a feed card lands in the rail without a manual refresh.
  const myUpcoming = useMyUpcomingEvents(events, currentUserId)
  const activeFilter = chosenFilter

  const filtersTouchedRef = useRef(typeInLink || surfaceInLink)
  useEffect(() => {
    if (filtersTouchedRef.current || feedFiltersNow()) return
    let live = true
    void loadFeedFilters().then(saved => {
      if (!live || filtersTouchedRef.current) return
      setChosenFilter(saved.filter)
      setSurfaceFilter(saved.surface)
    })
    return () => { live = false }
  }, [])

  const selectFilters = useCallback((next: StoredFeedFilters) => {
    filtersTouchedRef.current = true
    track(ANALYTICS_EVENTS.feedFilterChanged, { filter: next.filter, surface: next.surface })
    setChosenFilter(next.filter)
    setSurfaceFilter(next.surface)
    saveFeedFilters(next)
  }, [])
  const selectFilter = useCallback((filter: FeedFilter) => selectFilters({ filter, surface: surfaceFilter }), [selectFilters, surfaceFilter])
  const selectSurface = useCallback((surface: SurfaceFilterValue) => selectFilters({ filter: chosenFilter, surface }), [selectFilters, chosenFilter])

  const handleRsvp: EventCardRsvpHandler = useCallback(async (eventId, action) => {
    if (!currentUserId) {
      requireSignIn(routes.event(eventId))
      return
    }
    await rsvp({ eventId, action, userId: currentUserId })
  }, [currentUserId, rsvp, requireSignIn])

  // The month(s) the week strip is showing: a week can straddle two months.
  const visibleMonths = useMemo((): string[] => {
    const weekStart = weekForIdx(curWeekPage)
    const weekEnd   = new Date(weekStart.getTime() + 6 * 86_400_000)
    const m1 = localDateKey(weekStart).substring(0, 7)
    const m2 = localDateKey(weekEnd).substring(0, 7)
    return m1 === m2 ? [m1] : [m1, m2]
  }, [curWeekPage])

  // Load months as the user navigates the calendar
  useEffect(() => {
    visibleMonths.forEach(m => { loadMonth(m) })
  }, [visibleMonths, loadMonth])

  // On desktop, the current month plus the next 3 so the grid isn't sparse.
  // One range query: the hook batches months requested in the same tick.
  useEffect(() => {
    if (isMobile) return
    const current = today.substring(0, 7)
    loadMonthSpan(current, addMonths(current, 3))
  }, [isMobile, loadMonthSpan, today])

  // Force-reload visible months after create/edit (cached data stays on screen meanwhile).
  // Focus/foreground refetch-when-stale and the signed-in-user change live in the hook.
  useEffect(() => {
    if (eventsRefreshTick > 0) {
      visibleMonths.forEach(m => { loadMonth(m, true) })
    }
  }, [eventsRefreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // The month immediately after the last loaded month — what to fetch on scroll-to-bottom
  const nextScrollMonth = useMemo(
    () => addMonths(loadedMonths[loadedMonths.length - 1] ?? today.substring(0, 7), 1),
    [loadedMonths, today],
  )

  const handleScrollNearBottom = useCallback(() => {
    if (!loading && !reachedEnd) loadMonth(nextScrollMonth)
  }, [loading, reachedEnd, loadMonth, nextScrollMonth])

  const handleEventsPullRefresh = useCallback(async () => {
    setEventsPullRefreshing(true)
    try {
      await Promise.all([refresh(), refetchNotifs(true)])
    } finally {
      setEventsPullRefreshing(false)
    }
  }, [refresh, refetchNotifs])

  const blockPager   = useCallback(() => { pagerBlocked.current = true  }, [pagerBlocked])
  const unblockPager = useCallback(() => { pagerBlocked.current = false }, [pagerBlocked])

  const sectionListRef = useRef<SectionList<EventWithDetails, DateSection>>(null)
  const sectionYRef = useRef<Record<string, number>>({})
  const lastScrollY = useRef(0)

  // ── Doc-scroll mode (mobile web): the document/body scrolls instead of the
  // inner ScrollView so browser URL bars collapse. Window listener handles
  // load-more (tab-bar hide/show is centralized in the tabs shell).
  const docScrollRef        = useRef(docScrollActive)
  docScrollRef.current      = docScrollActive
  const feedContentRef      = useRef<View>(null)
  // Narrow web: come back to the same place in the feed after an event page
  // (the browser's back remounts this screen; see hooks/useDocScrollMemory).
  // The whole screen stays hidden until the offset is back, header included (#254).
  const screenRootRef       = useRef<View>(null)
  const feedDocLayout       = useDocScrollMemory('tab:events', docScrollActive, feedContentRef, undefined, screenRootRef)

  useEffect(() => {
    if (!docScrollActive || typeof window === 'undefined') return
    const onWindowScroll = () => {
      if (window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 400) {
        handleScrollNearBottom()
      }
    }
    window.addEventListener('scroll', onWindowScroll, { passive: true })
    return () => window.removeEventListener('scroll', onWindowScroll)
  }, [docScrollActive, handleScrollNearBottom])

  // Hidden for this player: matched by an entry, and not one of their own
  // (going, waitlisted, hosting: those always show).
  // Outside tournaments (Schelagg's programs feed) join the feed on their first day, within the
  // months already loaded so they don't run ahead of infinite scroll. Leagues get their own screen.
  const programs = useExternalPrograms()
  const lastLoadedMonth = loadedMonths[loadedMonths.length - 1] ?? null
  // Under the Tournament filter the list isn't about a day: every upcoming outside tournament shows,
  // however far out, including the ones elsewhere in the state (people travel for those).
  const tournamentsOnly = activeFilter === 'tournament'
  // The week strip hides under Tournament, except while the tour's "Pick a day" step points at it.
  const tourWantsCalendar = useTourWants(TOUR_TARGETS.calendar)
  const showCalendar = !tournamentsOnly || tourWantsCalendar
  const feedEvents = useMemo(() => {
    const rows = tournamentsOnly
      ? [...(programs.data?.tournaments ?? []), ...(programs.data?.elsewhere ?? [])]
      : programs.data?.tournaments ?? []
    const items = normalizeProgramTournaments(rows)
      .filter(e => tournamentsOnly || (!!lastLoadedMonth && eventLocalDateKey(e.event_date).substring(0, 7) <= lastLoadedMonth))
    return items.length ? [...events, ...items] : events
  }, [events, programs.data, lastLoadedMonth, tournamentsOnly])

  const isHiddenForMe = useCallback(
    (event: EventWithDetails) =>
      isHidden(event, hiddenIdx) && !(currentUserId && myStatusFor(event, currentUserId) !== null),
    [hiddenIdx, currentUserId],
  )

  const { sections, hiddenItemIds } = useMemo(() => {
    const filtered = feedEvents.filter(event => {
      // Outside sessions (Schelagg) only for the viewer's region: home city, else the pilot default.
      if (event._external && event._external.region !== feedRegion) return false
      if (surfaceFilter !== 'any' && surfaceOf(event) !== surfaceFilter) return false
      if (activeFilter === 'all') return true
      const tags = event.event_tags?.map(et => et.tags.name.toLowerCase()) ?? []
      if (activeFilter === 'open_play')  return tags.some(t => t.includes('open play') || t.includes('open-play'))
      if (activeFilter === 'tournament') return tags.some(t => t.includes('tournament'))
      return true
    })
    const grouped: Record<string, DateSection> = {}
    const hiddenIds = new Set<string>()
    for (const event of [...filtered].sort((a, b) => a.event_date.localeCompare(b.event_date))) {
      // Local date, so the section header matches the time shown on the event
      // card — and matches the calendar dot, which uses the same helper.
      const date = eventLocalDateKey(event.event_date)
      const section = grouped[date] ??= {
        date, data: [], hiddenCount: 0, revealed: revealedKeys.has(date) || revealedKeys.has(date.substring(0, 7)),
      }
      if (isHiddenForMe(event)) {
        section.hiddenCount += 1
        hiddenIds.add(event.id)
        if (!section.revealed) continue
      }
      section.data.push(event)
    }
    const list = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date))
    return { sections: list, hiddenItemIds: hiddenIds }
  }, [feedEvents, activeFilter, surfaceFilter, currentUserId, feedRegion, isHiddenForMe, revealedKeys])

  const toggleReveal = useCallback((key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const openHideMenu = useCallback((event: EventWithDetails) => {
    if (!currentUserId) { requireSignIn(); return }
    setHideTarget(event)
  }, [currentUserId, requireSignIn])

  const pickHideOption = useCallback((option: HideFeedOption) => {
    const before = hiddenFeed.entries
    setHideTarget(null)
    hiddenFeed.hide(option.entry)
    showHideToast(`Hidden: ${option.entry.label}`, before)
  }, [hiddenFeed])

  const unhideItem = useCallback((event: EventWithDetails) => {
    const before = hiddenFeed.entries
    const matches = matchingEntries(event, before)
    if (matches.length === 0) return
    hiddenFeed.restore(before.filter(e => !matches.includes(e)))
    showHideToast(`Showing again: ${matches.map(m => m.label).join(', ')}`, before)
  }, [hiddenFeed])

  const hideOptionsFor = useMemo(
    () => (hideTarget ? hideOptions(hideTarget, currentUserId) : []),
    [hideTarget, currentUserId],
  )

  // "Ana and 2 friends going" on cards (#15): one RPC for the loaded RSVP-able events.
  const friendEventIds = useMemo(() => events.filter(e => !e._external && !e._isTournament).map(e => e.id), [events])
  const friendsGoing = useFriendsGoing(friendEventIds)

  const railNode = (
    <MyEventsRail
      items={myUpcoming}
      onPressEvent={eventId => router.push(routes.event(eventId))}
    />
  )

  // Calendar dots leave out what this player hid.
  const markedDates = useMemo(
    () => buildMarkedDates(hiddenIdx.size ? feedEvents.filter(e => !isHiddenForMe(e)) : feedEvents, selectedDate),
    [feedEvents, selectedDate, hiddenIdx, isHiddenForMe],
  )

  const selectDate = useCallback((dateStr: string) => {
    setSelectedDate(dateStr)
    setUrlDay(dateStr === today ? '' : dateStr)
    setCurWeekPage(idxForWeek(getWeekStart(new Date(dateStr + 'T00:00:00'))))
    setCurMonthPage(idxForMonth(dateStr.substring(0, 7)))
    const sectionIndex = sections.findIndex(s => s.date === dateStr)
    setTimeout(() => {
      if (docScrollRef.current) {
        const y = sectionYRef.current[dateStr]
        if (y === undefined) return
        const node = feedContentRef.current as unknown as HTMLElement | null
        if (node?.getBoundingClientRect) {
          const top = node.getBoundingClientRect().top + window.scrollY + y
          window.scrollTo({ top, behavior: 'smooth' })
        }
        return
      }
      if (sectionIndex >= 0) {
        try {
          sectionListRef.current?.scrollToLocation({
            sectionIndex,
            itemIndex: 0,
            animated: true,
            viewOffset: 8,
          })
        } catch {
          /* SectionList may throw if layout isn't ready yet */
        }
      }
    }, 50)
  }, [sections, today, setUrlDay])

  // A link to a day (`?day=`) scrolls there once that day's games have loaded.
  const linkedDayRef = useRef<string | null>(selectedDate !== today ? selectedDate : null)
  useEffect(() => {
    const day = linkedDayRef.current
    if (!day || !sections.some(sec => sec.date === day)) return
    linkedDayRef.current = null
    selectDate(day)
  }, [sections, selectDate])

  const goPrevWeek  = useCallback(() => setCurWeekPage(p => p - 1), [])
  const goNextWeek  = useCallback(() => setCurWeekPage(p => p + 1), [])
  const goToday     = useCallback(() => selectDate(today), [selectDate, today])

  // Midnight passed (or the app woke up on a new day): if the player was on
  // "today", follow it to the new day; a date they picked themselves stays.
  const prevTodayRef = useRef(today)
  useEffect(() => {
    const prev = prevTodayRef.current
    prevTodayRef.current = today
    if (prev !== today && selectedDate === prev) selectDate(today)
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps
  const goPrevMonth = useCallback(() => setCurMonthPage(p => p - 1), [])
  const goNextMonth = useCallback(() => setCurMonthPage(p => p + 1), [])

  const openNotifItem = useCallback(
    async (item: NotificationItem) => {
      setNotifOpen(false)
      try {
        if (!item.read_at) await markRead(item.id, item.groupIds)
      } catch {
        /* ignore */
      }
      const path = item.data?.deep_link
      if (isAppPath(path)) {
        router.push(toRoute(path))
        return
      }
      if (item.data?.event_id) {
        router.push(routes.event(item.data.event_id))
      }
    },
    [markRead, router],
  )

  const toggleNotifPanel = useCallback(() => {
    setNotifOpen(o => {
      if (!o) void refetchNotifs(true)
      return !o
    })
  }, [refetchNotifs])

  // Flatten all events from sections for desktop grid layout
  const allEvents = useMemo(() => sections.flatMap(s => s.data), [sections])
  // "Next up" links to an event page, so it skips sessions at other venues.
  const nextClubEvent = useMemo(() => allEvents.find(e => !e._external), [allEvents])

  // Ads: everything goes through useAdsEnabled + planFeedAds; the render paths
  // below only ask "is this sponsored?" and "what follows this item?".
  const showAds = useAdsEnabled()
  const feedAds = useFeedAds(showAds)
  const adPlan = useMemo(() => planFeedAds(allEvents, feedAds, showAds), [allEvents, feedAds, showAds])
  // Weather chips for sand / grass events in the next 7 days (#165): one request per court.
  const forecasts = useFeedForecasts(allEvents)
  const sponsoredIds = useMemo(() => new Set(showAds ? feedAds?.sponsoredEventIds ?? [] : []), [showAds, feedAds])

  // Share appears once the view is more than the plain feed: a filter or a day other than today.
  const viewFiltered = activeFilter !== 'all' || surfaceFilter !== 'any' || selectedDate !== today
  const shareButton = viewFiltered ? (
    <ShareLinkButton
      path={routes.events({ type: activeFilter, surface: surfaceFilter, day: selectedDate === today ? '' : selectedDate })}
      title="Volleyball games on vteam"
      screen="events"
      filtered
      testID="events-share-button"
    />
  ) : null
  const accountButton = isGuest ? <SignInButton /> : (
    <IconButton
      icon={notifOpen ? 'notifications' : 'notifications-outline'}
      label="Notifications"
      active={notifOpen}
      badge={unreadCount > 0}
      onPress={toggleNotifPanel}
    />
  )
  // Search (#176): games, places, hosts and clubs; `/` opens it on desktop web.
  const searchButton = (
    <IconButton icon="search-outline" label="Search" size={44} onPress={() => router.push(routes.search())} testID="events-search-button" />
  )
  const headerRight = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      {shareButton}
      {searchButton}
      {accountButton}
    </View>
  )

  // A refresh failed while older events are on screen (cache or last visit's
  // saved feed): say so rather than silently showing what may be out of date.
  const staleNotice = error && events.length > 0 ? (
    <TouchableOpacity
      onPress={() => void refresh()}
      accessibilityRole="button"
      accessibilityLabel={FEED_STALE_NOTICE}
      style={[shared.feedStaleNotice, isMobile && shared.feedStaleNoticeMobile]}
    >
      <Text style={shared.feedStaleNoticeText}>{FEED_STALE_NOTICE}</Text>
    </TouchableOpacity>
  ) : null

  const filterChips = (
    <>
      <OneTimeBanner banner={BANNERS.austinPilot} style={isMobile ? shared.feedStaleNoticeMobile : undefined} />
      <TourTarget id={TOUR_TARGETS.feedFilters}>
        <FilterChips
          chips={FILTER_CHIPS}
          active={activeFilter}
          onSelect={selectFilter}
          wide={!isMobile}
        />
        <SurfaceFilter active={surfaceFilter} onSelect={selectSurface} wide={!isMobile} />
      </TourTarget>
      {activeFilter === 'tournament' && <AllTournamentsLink onPress={() => router.push(routes.tournaments())} />}
      {(activeFilter === 'all' || activeFilter === 'tournament') && !!programs.data?.leagues.length && (
        <LeaguesLink count={programs.data.leagues.length} onPress={() => router.push(routes.leagues())} />
      )}
      {staleNotice}
    </>
  )

  // Shown in place of the cards when the (filtered) feed is empty. An error
  // only counts when there's nothing loaded at all: with data cached, a failed
  // refetch keeps it on screen.
  const feedEmpty = (
    <FeedEmpty
      // Under Tournament most rows are outside tournaments: keep the spinner until they've loaded too,
      // rather than saying nothing matches the filter.
      loading={loading || (tournamentsOnly && programs.isLoading && !programs.data)}
      error={events.length === 0 ? error : null}
      onRetry={() => void refresh()}
      filterActive={activeFilter !== 'all' || surfaceFilter !== 'any'}
      isGuest={isGuest}
      onClearFilter={() => selectFilters(DEFAULT_FEED_FILTERS)}
    />
  )

  const refreshControl = (
    <RefreshControl refreshing={eventsPullRefreshing} onRefresh={() => void handleEventsPullRefresh()} tintColor={theme.colors.primary} />
  )

  const notificationPopup = (
    <NotificationPopup
      visible={notifOpen}
      items={notifItems}
      loading={notifLoading}
      unreadCount={unreadCount}
      insetTop={insets.top}
      // Read at render (the popup only matters while open) instead of
      // subscribing the whole screen to every resize.
      windowWidth={Dimensions.get('window').width}
      onDismiss={() => setNotifOpen(false)}
      onOpenItem={openNotifItem}
      onMarkAllRead={() => void markAllRead()}
      onSeeAll={() => { setNotifOpen(false); router.push(routes.notifications()) }}
    />
  )

  // ── Desktop layout ────────────────────────────────────────────────────────
  if (!isMobile) {

    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.background }}>

        {/* Main content */}
        {/* Remembers its offset under the same key as narrow web, so the browser's
            Back from an event page returns to the same place (#254). */}
        <DocScrollView
          docScroll={false}
          memoryKey="tab:events"
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 28, paddingBottom: 48 }}
          scrollEventThrottle={200}
          onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
            if (contentSize.height - contentOffset.y - layoutMeasurement.height < 400) {
              handleScrollNearBottom()
            }
          }}
          refreshControl={refreshControl}
        >
          <EventsHeader wide right={headerRight} />

          {filterChips}

          {railNode}

          {/* Tagged so e2e can scope feed assertions: the rail deliberately
              ignores the active filter, so a page-wide text count would see it. */}
          <View testID="events-feed">
          {sections.length === 0 ? feedEmpty : (
            <>
              {Object.entries(
                sections.reduce<Record<string, { events: EventWithDetails[]; hidden: number }>>((acc, section) => {
                  const month = section.date.substring(0, 7)
                  const entry = acc[month] ??= { events: [], hidden: 0 }
                  entry.events.push(...section.data)
                  entry.hidden += section.hiddenCount
                  return acc
                }, {})
              ).map(([month, { events: monthEvents, hidden: monthHidden }]) => {
                const [y, m] = month.split('-').map(Number)
                const d = new Date(y, m - 1, 1)
                const isCurrentMonth = month === today.substring(0, 7)
                const label = isCurrentMonth
                  ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + ' · This month'
                  : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                return (
                  <View key={month} style={{ marginBottom: 32 }}>
                    <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.heading.sm, letterSpacing: -0.4, color: theme.colors.text, marginBottom: 12 }}>
                      {label}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {monthEvents.map(item => {
                        const renderRowCard = (event: EventWithDetails, menuInset = false) => (
                          <RowEventCard
                            event={event}
                            currentUserId={currentUserId}
                            onRsvp={event._isTournament ? undefined : handleRsvp}
                            rsvpPending={isRsvpPending(event.id)}
                            forecast={forecasts.get(event.id)}
                            menuInset={menuInset}
                            friendsGoing={friendsGoing.get(event.id)}
                          />
                        )
                        const withMenu = !(currentUserId && myStatusFor(item, currentUserId) !== null)
                        const card = item._external
                          ? <ExternalSessionCard session={item._external} menuInset={withMenu} />
                          : item._program
                            ? <ExternalProgramCard program={item._program} menuInset={withMenu} />
                            : renderRowCard(item, withMenu)
                        return (
                          <React.Fragment key={item.id}>
                            <View style={{ width: 'calc(50% - 5px)' as any }}>
                              {sponsoredIds.has(item.id) && <SponsoredLabel />}
                              {withMenu ? (
                                <FeedItemShell
                                  onMore={() => openHideMenu(item)}
                                  moreLabel={`Hide options for ${item.title}`}
                                  hidden={hiddenItemIds.has(item.id)}
                                  onUnhide={() => unhideItem(item)}
                                >
                                  {card}
                                </FeedItemShell>
                              ) : card}
                            </View>
                            {adPlan.get(item.id)?.map(ad => ad.kind === 'banner' ? (
                              <View key={`ad-${ad.banner.id}`} style={{ width: '100%' }}>
                                <FeedBanner banner={ad.banner} />
                              </View>
                            ) : (
                              <View key={`sponsored-${ad.event.id}`} style={{ width: 'calc(50% - 5px)' as any }}>
                                <SponsoredLabel />
                                {renderRowCard(ad.event)}
                              </View>
                            ))}
                          </React.Fragment>
                        )
                      })}
                    </View>
                    <HiddenCountRow count={monthHidden} revealed={revealedKeys.has(month)} onToggle={() => toggleReveal(month)} />
                  </View>
                )
              })}

              {loading && (
                <Spinner style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primary} />
              )}
            </>
          )}
          </View>
        </DocScrollView>

        {/* Right rail */}
        <View style={{
          width: 300,
          borderLeftWidth: 1,
          borderLeftColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          flexShrink: 0,
        }}>
          <ScrollView
            contentContainerStyle={{ padding: 20 }}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          >
            {/* Mini calendar (not under the Tournament filter: that list isn't about a day) */}
            {!tournamentsOnly && <Text style={feedStyles.railLabel}>This week</Text>}
            {showCalendar && <TourTarget id={TOUR_TARGETS.calendar} style={{ backgroundColor: theme.colors.background, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 20, overflow: 'hidden' }}>
              <MonthGridContent
                month={monthForIdx(curMonthPage)}
                selectedDate={selectedDate}
                markedDates={markedDates}
                onSelectDate={selectDate}
                onPrevMonth={goPrevMonth}
                onNextMonth={goNextMonth}
              />
            </TourTarget>}

            {/* Your next event */}
            {nextClubEvent && (
              <>
                <Text style={feedStyles.railLabel}>Next up</Text>
                <NextUpCard
                  event={nextClubEvent}
                  onPress={() => router.push(nextClubEvent._isTournament ? routes.tournament(nextClubEvent.id) : routes.event(nextClubEvent.id))}
                />
              </>
            )}

          </ScrollView>
        </View>

        {notificationPopup}
        <HideFeedSheet
          visible={!!hideTarget}
          itemTitle={hideTarget?.title}
          options={hideOptionsFor}
          onPick={pickHideOption}
          onDismiss={() => setHideTarget(null)}
        />
      </View>
    )
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  return (
    // Doc-scroll mode: auto height so the feed extends the document (body scrolls)
    <View ref={screenRootRef} style={docScrollActive ? [shared.screen, { flex: undefined } as any] : shared.screen}>
      <View
        onTouchStart={blockPager}
        onTouchEnd={unblockPager}
        onTouchCancel={unblockPager}
      >
        <EventsHeader
          wide={false}
          right={curWeekPage === WEEK_CENTER ? headerRight : (
            <View style={weekNavStyles.headerRight}>
              <TouchableOpacity
                testID="week-today"
                onPress={goToday}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Go to this week"
                style={weekNavStyles.today}
              >
                <Text maxFontSizeMultiplier={TIGHT_TEXT_SCALE} style={weekNavStyles.todayLabel}>Today</Text>
              </TouchableOpacity>
              {headerRight}
            </View>
          )}
        />

        {/* Calendar strip (not under the Tournament filter: that list isn't about a day) */}
        {showCalendar && <TourTarget id={TOUR_TARGETS.calendar}>
          <WeekPager
            curWeekPage={curWeekPage}
            selectedDate={selectedDate}
            markedDates={markedDates}
            onSelectDate={selectDate}
            onPrevWeek={goPrevWeek}
            onNextWeek={goNextWeek}
          />
        </TourTarget>}

        {filterChips}
      </View>

      {(() => {
        const emptyOrLoading = sections.length === 0 ? feedEmpty : null

        const renderSectionHeader = (section: DateSection) => (
          <View
            style={feedStyles.sectionHeader}
            onLayout={e => { sectionYRef.current[section.date] = e.nativeEvent.layout.y }}
          >
            <Text style={feedStyles.sectionDate} testID={`feed-day-${section.date}`}>{dayLabel(section.date, today)}</Text>
            {section.data.length > 0 && (
              <Text style={feedStyles.sectionCountText}>{section.data.length} {section.data.length === 1 ? 'event' : 'events'}</Text>
            )}
          </View>
        )

        const renderSectionFooter = (section: DateSection) => (
          section.hiddenCount > 0 ? (
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <HiddenCountRow count={section.hiddenCount} revealed={section.revealed} onToggle={() => toggleReveal(section.date)} />
            </View>
          ) : null
        )

        // `menu`: the ⋯ hide button, for feed items that aren't the player's own (and not promoted slots).
        const renderCard = (item: EventWithDetails, menu = true) => {
          const withMenu = menu && !(currentUserId && myStatusFor(item, currentUserId) !== null)
          const card = item._external ? (
            <ExternalSessionCard session={item._external} menuInset={withMenu} />
          ) : item._program ? (
            <ExternalProgramCard program={item._program} menuInset={withMenu} />
          ) : (
            <EventCard
              event={item}
              currentUserId={currentUserId}
              onRsvp={item._isTournament ? undefined : handleRsvp}
              rsvpPending={isRsvpPending(item.id)}
              friendsGoing={friendsGoing.get(item.id)}
              forecast={forecasts.get(item.id)}
              menuInset={withMenu}
            />
          )
          return (
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              {sponsoredIds.has(item.id) && <SponsoredLabel />}
              {withMenu ? (
                <FeedItemShell
                  onMore={() => openHideMenu(item)}
                  moreLabel={`Hide options for ${item.title}`}
                  hidden={hiddenItemIds.has(item.id)}
                  onUnhide={() => unhideItem(item)}
                >
                  {card}
                </FeedItemShell>
              ) : card}
            </View>
          )
        }

        // The card, then any ads planned after it (planFeedAds).
        const renderEvent = (item: EventWithDetails) => {
          const ads = adPlan.get(item.id)
          if (!ads) return renderCard(item)
          return (
            <>
              {renderCard(item)}
              {ads.map(ad => ad.kind === 'banner' ? (
                <View key={`ad-${ad.banner.id}`} style={{ paddingHorizontal: theme.spacing.lg }}>
                  <FeedBanner banner={ad.banner} />
                </View>
              ) : (
                <React.Fragment key={`sponsored-${ad.event.id}`}>{renderCard(ad.event, false)}</React.Fragment>
              ))}
            </>
          )
        }

        // Doc-scroll mode: plain View in document flow — the BODY scrolls
        // (window scroll listener above handles load-more + tab bar hide).
        // Keep full tree mounted so Safari/Chrome can collapse URL bars.
        if (docScrollActive) {
          return (
            <View ref={feedContentRef} onLayout={feedDocLayout} style={{ paddingBottom: tabBarHeight + 32 }}>
              <DocPullToRefresh {...refreshControl.props} />
              <View style={{ paddingHorizontal: theme.spacing.lg }}>{railNode}</View>
              <View testID="events-feed">
              {emptyOrLoading ?? sections.map(section => (
                <View key={section.date} onLayout={e => { sectionYRef.current[section.date] = e.nativeEvent.layout.y }}>
                  {renderSectionHeader(section)}
                  {section.data.map(item => (
                    <React.Fragment key={item.id}>{renderEvent(item)}</React.Fragment>
                  ))}
                  {renderSectionFooter(section)}
                </View>
              ))}
              {loading && sections.length > 0 && (
                <Spinner style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primary} />
              )}
              </View>
            </View>
          )
        }

        if (emptyOrLoading) {
          return (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
              refreshControl={refreshControl}
            >
              {/* The rail is derived from all loaded events, so it can be
                  non-empty even when the active filter matches nothing. */}
              <View style={{ paddingHorizontal: theme.spacing.lg }}>{railNode}</View>
              {emptyOrLoading}
            </ScrollView>
          )
        }

        return (
          <SectionList
            ref={sectionListRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
            sections={sections}
            keyExtractor={item => item.id}
            // No `events-feed` testID here on purpose: the rail lives in
            // ListHeaderComponent, so tagging the list would include it and
            // defeat the scoping. The two paths e2e actually drives (desktop and
            // doc-scroll) keep the rail outside their tagged wrapper.
            ListHeaderComponent={
              <View style={{ paddingHorizontal: theme.spacing.lg }}>{railNode}</View>
            }
            renderItem={({ item }) => renderEvent(item)}
            extraData={[forecasts, hiddenItemIds]}
            renderSectionHeader={({ section }) => renderSectionHeader(section)}
            renderSectionFooter={({ section }) => renderSectionFooter(section)}
            stickySectionHeadersEnabled={false}
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            onEndReached={() => { handleScrollNearBottom() }}
            onEndReachedThreshold={0.5}
            scrollEventThrottle={64}
            onScroll={({ nativeEvent: { contentOffset } }) => {
              if (Platform.OS === 'web') {
                const y = contentOffset.y
                const diff = y - lastScrollY.current
                lastScrollY.current = y
                if (y <= 60) { setTabBarHidden(false); return }
                if (Math.abs(diff) > 5) setTabBarHidden(diff > 0)
              }
            }}
            ListFooterComponent={
              loading && sections.length > 0
                ? <Spinner style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primary} />
                : null
            }
            refreshControl={refreshControl}
          />
        )
      })()}

      {notificationPopup}
      <HideFeedSheet
        visible={!!hideTarget}
        itemTitle={hideTarget?.title}
        options={hideOptionsFor}
        onPick={pickHideOption}
        onDismiss={() => setHideTarget(null)}
      />
    </View>
  )
}

const feedStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md + 4,
    paddingBottom: theme.spacing.xs,
  },
  sectionDate: {
    fontFamily: theme.fonts.display,
    fontSize: theme.font.heading.sm,
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  sectionCountText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.subtext,
  },
  /** Desktop right-rail section labels ("This week", "Next up"). */
  railLabel: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    letterSpacing: 1,
    color: theme.colors.subtext,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
})
