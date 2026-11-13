import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'expo-router'
import { Platform, View, TouchableOpacity } from 'react-native'
import type { ViewInstance } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { RefreshControl } from '../../../../components/RefreshControl'
import { useFeedRsvp, useMonthEvents } from '../../../../hooks/useMonthEvents'
import { useDocScrollMemory, useDocScrollRefocus } from '../../../../hooks/useDocScrollMemory'
import { useIsNarrowWeb } from '../../../../hooks/useIsNarrowWeb'
import { useFriendsGoing } from '../../../../hooks/useFriendsGoing'
import { MyEventsRail } from '../../../../components/MyEventsRail'
import { EventsHeader } from '../../../../components/events/EventsHeader'
import { EventsFeedDesktop } from '../../../../components/events/EventsFeedDesktop'
import { EventsFeedMobile } from '../../../../components/events/EventsFeedMobile'
import { FilterChips } from '../../../../components/events/FilterChips'
import { SurfaceFilter } from '../../../../components/events/SurfaceFilter'
import { FeedEmpty } from '../../../../components/events/FeedEmpty'
import { AllTournamentsLink } from '../../../../components/events/AllTournamentsLink'
import { LeaguesLink } from '../../../../components/events/LeaguesLink'
import { useExternalPrograms } from '../../../../hooks/useExternalPrograms'
import { normalizeProgramTournaments } from '../../../../utils/feedItems'
import { useMyUpcomingEvents } from '../../../../hooks/useMyUpcomingEvents'
import { useEventsNotifications } from '../../../../hooks/useEventsNotifications'
import { BANNERS, BREAKPOINTS, FEED_STALE_NOTICE, TOUR_TARGETS, shared, theme } from '../../../../constants'
import { track } from '../../../../lib/analytics'
import { ANALYTICS_EVENTS } from '../../../../constants/analytics'
import { TourTarget } from '../../../../components/tour/TourTarget'
import { useTourWants } from '../../../../contexts/tour'
import { OneTimeBanner } from '../../../../components/ui'
import { useFeedRegion } from '../../../../hooks/useUserSettings'
import type { EventCardRsvpHandler, FeedCardContext, FeedFilter, FeedFilterChip, StoredFeedFilters, SurfaceFilter as SurfaceFilterValue } from '../../../../types'
import { buildFeedSections } from '../../../../utils/feedSections'
import { DEFAULT_FEED_FILTERS, feedFiltersNow, loadFeedFilters, saveFeedFilters } from '../../../../utils/feedFilters'
import { useUrlParam } from '../../../../hooks/useUrlParam'
import { useFeedDay } from '../../../../hooks/useFeedDay'
import { VIEW } from '../../../../utils/urlViews'
import { useTabsShell } from '../../../../contexts/tabs'
import { useSession } from '../../../../contexts/session'
import { useRequireSignIn } from '../../../../hooks/useRequireSignIn'
import { SignInButton } from '../../../../components/SignInButton'
import { addMonths } from '../../../../utils/monthKeys'
import { routes } from '../../../../utils/routes'
import { eventLocalDateKey, localDateKey } from '../../../../utils'
import { useToday } from '../../../../hooks/useToday'
import { useAdsEnabled } from '../../../../hooks/useAdsEnabled'
import { useFeedAds } from '../../../../hooks/useFeedAds'
import { useFeedForecasts } from '../../../../hooks/useForecast'
import { planFeedAds } from '../../../../utils/feedAds'
import { HideFeedSheet } from '../../../../components/events/FeedHiding'
import { useFeedHiding } from '../../../../hooks/useFeedHiding'
import { ShareLinkButton } from '../../../../components/ShareLinkButton'
import { buildMarkedDates, monthForIdx, weekForIdx } from '../../../../utils/calendarWeeks'

// No "Mine" chip: the games a player is going to or hosting are already in the
// "You're going" rail above the feed.
const FILTER_CHIPS: FeedFilterChip[] = [
  { id: 'all',        label: 'All'        },
  { id: 'open_play',  label: 'Open Play'  },
  { id: 'tournament', label: 'Tournament' },
]

export default function EventsScreen() {
  const router = useRouter()
  const { events, loading, error, loadMonth, loadMonthSpan, refresh, loadedMonths, reachedEnd } = useMonthEvents()
  const { rsvp, isPending: isRsvpPending } = useFeedRsvp()
  // The header's bell and its popup.
  const notifs = useEventsNotifications()
  const { pagerBlocked, setTabBarHidden, tabBarHeight, eventsRefreshTick, docScrollActive } = useTabsShell()
  // Native is always the mobile layout; web flips at the sidebar breakpoint.
  const narrowWeb = useIsNarrowWeb(BREAKPOINTS.sidebar)
  const isMobile = Platform.OS !== 'web' || narrowWeb

  const today = useToday()
  // The view is in the URL (`/?type=tournament&surface=sand&day=2026-11-14`, utils/urlViews) so a
  // copied link opens it. A link's filters show for that visit only; without them the
  // filters remembered on this device (utils/feedFilters) are used and written to the address.
  const [chosenFilter, setChosenFilter, typeInLink] = useUrlParam('type', VIEW.feed.type, {
    tab: 'events', fallback: () => feedFiltersNow()?.filter ?? DEFAULT_FEED_FILTERS.filter,
  })
  const [surfaceFilter, setSurfaceFilter, surfaceInLink] = useUrlParam('surface', VIEW.feed.surface, {
    tab: 'events', fallback: () => feedFiltersNow()?.surface ?? DEFAULT_FEED_FILTERS.surface,
  })
  const feedRegion = useFeedRegion()
  // What this player hid from the feed (Settings → Hidden in feed), the ⋯ menu and revealed days.
  const {
    anyHidden, isHiddenForMe, revealedKeys, toggleReveal,
    hideTarget, hideOptionsFor, openHideMenu, closeHideMenu, pickHideOption, unhideItem,
  } = useFeedHiding()
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
      await Promise.all([refresh(), notifs.refetch(true)])
    } finally {
      setEventsPullRefreshing(false)
    }
  }, [refresh, notifs.refetch])

  const blockPager   = useCallback(() => { pagerBlocked.current = true  }, [pagerBlocked])
  const unblockPager = useCallback(() => { pagerBlocked.current = false }, [pagerBlocked])

  // ── Doc-scroll mode (mobile web): the document/body scrolls instead of the
  // inner ScrollView so browser URL bars collapse. Window listener handles
  // load-more (tab-bar hide/show is centralized in the tabs shell).
  const feedContentRef      = useRef<ViewInstance>(null)
  // Narrow web: come back to the same place in the feed after an event page
  // (the browser's back remounts this screen; see hooks/useDocScrollMemory).
  // The whole screen stays hidden until the offset is back, header included (#254).
  const screenRootRef       = useRef<ViewInstance>(null)
  const feedDocLayout       = useDocScrollMemory('tab:events', docScrollActive, feedContentRef, undefined, screenRootRef)
  useDocScrollRefocus('tab:events', docScrollActive, feedContentRef, screenRootRef)

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

  const { sections, hiddenItemIds } = useMemo(
    () => buildFeedSections(feedEvents, {
      filter: activeFilter, surface: surfaceFilter, region: feedRegion, isHidden: isHiddenForMe, revealed: revealedKeys,
    }),
    [feedEvents, activeFilter, surfaceFilter, feedRegion, isHiddenForMe, revealedKeys],
  )

  // The picked day, the calendar pages, and scrolling the feed to a day.
  const {
    selectedDate, curWeekPage, curMonthPage, selectDate,
    goPrevWeek, goNextWeek, goToday, goPrevMonth, goNextMonth, sectionListRef, sectionYRef,
  } = useFeedDay({ today, sections, docScrollActive, feedContentRef })

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
    () => buildMarkedDates(anyHidden ? feedEvents.filter(e => !isHiddenForMe(e)) : feedEvents, selectedDate),
    [feedEvents, selectedDate, anyHidden, isHiddenForMe],
  )

  // Flatten all events from sections for desktop grid layout
  const allEvents = useMemo(() => sections.flatMap(s => s.data), [sections])
  // "Next up" links to an event page, so it skips sessions at other venues.
  const nextClubEvent = useMemo(() => allEvents.find(e => !e._external), [allEvents])
  const openNextUp = useCallback(() => {
    if (nextClubEvent) router.push(nextClubEvent._isTournament ? routes.tournament(nextClubEvent.id) : routes.event(nextClubEvent.id))
  }, [nextClubEvent, router])

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
  const accountButton = isGuest ? <SignInButton /> : notifs.button
  const headerRight = shareButton ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      {shareButton}
      {accountButton}
    </View>
  ) : accountButton

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

  const cards = useMemo((): FeedCardContext => ({
    currentUserId, onRsvp: handleRsvp, isRsvpPending, forecasts, friendsGoing, sponsoredIds, adPlan, hiddenItemIds,
    onMore: openHideMenu, onUnhide: unhideItem,
  }), [currentUserId, handleRsvp, isRsvpPending, forecasts, friendsGoing, sponsoredIds, adPlan, hiddenItemIds, openHideMenu, unhideItem])

  const overlays = (
    <>
      {notifs.popup}
      <HideFeedSheet
        visible={!!hideTarget}
        itemTitle={hideTarget?.title}
        options={hideOptionsFor}
        onPick={pickHideOption}
        onDismiss={closeHideMenu}
      />
    </>
  )

  const layoutProps = {
    sections, today, loading, cards, onToggleReveal: toggleReveal, refreshControl, onNearBottom: handleScrollNearBottom,
    filterChips, rail: railNode, feedEmpty, overlays, showCalendar, selectedDate, markedDates, onSelectDate: selectDate,
  }

  if (!isMobile) {
    return (
      <EventsFeedDesktop
        {...layoutProps}
        header={<EventsHeader wide right={headerRight} />}
        revealedKeys={revealedKeys}
        calendarLabel={!tournamentsOnly}
        month={monthForIdx(curMonthPage)}
        onPrevMonth={goPrevMonth}
        onNextMonth={goNextMonth}
        nextUp={nextClubEvent}
        onPressNextUp={openNextUp}
      />
    )
  }

  return (
    <EventsFeedMobile
      {...layoutProps}
      headerRight={headerRight}
      curWeekPage={curWeekPage}
      onPrevWeek={goPrevWeek}
      onNextWeek={goNextWeek}
      onToday={goToday}
      docScrollActive={docScrollActive}
      tabBarHeight={tabBarHeight}
      onHeaderTouchStart={blockPager}
      onHeaderTouchEnd={unblockPager}
      onScrollTabBar={setTabBarHidden}
      feedDocLayout={feedDocLayout}
      screenRootRef={screenRootRef}
      feedContentRef={feedContentRef}
      sectionListRef={sectionListRef}
      sectionYRef={sectionYRef}
    />
  )
}
