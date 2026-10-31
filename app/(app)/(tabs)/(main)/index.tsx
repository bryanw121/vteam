import React, { useState, useRef, useMemo, useCallback, memo, useEffect, useLayoutEffect } from 'react'
import { useRouter } from 'expo-router'
import { Dimensions, Platform, View, ScrollView, SectionList, TouchableOpacity, PanResponder, Animated, ActivityIndicator, StyleSheet } from 'react-native'
import { Text } from '../../../../components/ui/Text'
import { DocPullToRefresh, RefreshControl } from '../../../../components/RefreshControl'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useFeedRsvp, useMonthEvents } from '../../../../hooks/useMonthEvents'
import { useNotifications } from '../../../../hooks/useNotifications'
import { useIsNarrowWeb } from '../../../../hooks/useIsNarrowWeb'
import { EventCard, RowEventCard } from '../../../../components/EventCard'
import type { EventCardRsvpHandler } from '../../../../types'
import { MyEventsRail } from '../../../../components/MyEventsRail'
import { ExternalSessionCard } from '../../../../components/ExternalSessionCard'
import { EventsHeader } from '../../../../components/events/EventsHeader'
import { FilterChips } from '../../../../components/events/FilterChips'
import { SurfaceFilter } from '../../../../components/events/SurfaceFilter'
import { FeedEmpty } from '../../../../components/events/FeedEmpty'
import { AllTournamentsLink } from '../../../../components/events/AllTournamentsLink'
import { NextUpCard } from '../../../../components/events/NextUpCard'
import { IconButton } from '../../../../components/ui'
import { myStatusFor, useMyUpcomingEvents } from '../../../../hooks/useMyUpcomingEvents'
import { NotificationPopup } from '../../../../components/NotificationPopup'
import { BANNERS, BREAKPOINTS, COMPACT_TEXT_SCALE, FEED_STALE_NOTICE, TIGHT_TEXT_SCALE, TOUR_TARGETS, shared, theme } from '../../../../constants'
import { TourTarget } from '../../../../components/tour/TourTarget'
import { OneTimeBanner } from '../../../../components/ui'
import { useFeedRegion } from '../../../../hooks/useUserSettings'
import type { EventWithDetails, FeedFilter, FeedFilterChip, Notification, StoredFeedFilters, SurfaceFilter as SurfaceFilterValue } from '../../../../types'
import { DEFAULT_FEED_FILTERS, feedFiltersNow, loadFeedFilters, saveFeedFilters, usableFeedFilter } from '../../../../utils/feedFilters'
import { useTabsShell } from '../../../../contexts/tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../../../../contexts/session'
import { useTextScale } from '../../../../contexts/textScale'
import { useRequireSignIn } from '../../../../hooks/useRequireSignIn'
import { SignInButton } from '../../../../components/SignInButton'
import { addMonths } from '../../../../utils/monthKeys'
import { routes, isAppPath, toRoute } from '../../../../utils/routes'
import { eventLocalDateKey, localDateKey, surfaceOf } from '../../../../utils'
import { useAdsEnabled } from '../../../../hooks/useAdsEnabled'
import { useFeedAds } from '../../../../hooks/useFeedAds'
import { planFeedAds } from '../../../../utils/feedAds'
import { FeedBanner } from '../../../../components/ads/FeedBanner'
import { SponsoredLabel } from '../../../../components/ads/SponsoredLabel'

const _now = new Date()
const TODAY = localDateKey(_now)
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const REF_WEEK  = getWeekStart(new Date())
const REF_MONTH = TODAY.substring(0, 7)
const WEEK_CENTER  = 52
const MONTH_CENTER = 24

function weekForIdx(i: number): Date {
  return offsetDate(REF_WEEK, (i - WEEK_CENTER) * 7)
}
function idxForWeek(date: Date): number {
  return WEEK_CENTER + Math.round((date.getTime() - REF_WEEK.getTime()) / (7 * 86400000))
}
function monthForIdx(i: number): string {
  return addMonths(REF_MONTH, i - MONTH_CENTER)
}
function idxForMonth(month: string): number {
  const [ry, rm] = REF_MONTH.split('-').map(Number)
  const [y,  m ] = month.split('-').map(Number)
  return MONTH_CENTER + (y - ry) * 12 + (m - rm)
}

// "Mine" leads the row but is deliberately NOT the default filter — opening the
// Events tab on an empty screen is the worst possible first run for a new member,
// and it hides the rest of the club from everyone else.
const FILTER_CHIPS: FeedFilterChip[] = [
  { id: 'mine',       label: 'Mine'       },
  { id: 'all',        label: 'All'        },
  { id: 'open_play',  label: 'Open Play'  },
  { id: 'tournament', label: 'Tournament' },
  { id: 'not_full',   label: 'Not Full'   },
]

type DateSection = { date: string; data: EventWithDetails[] }
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

  const [selectedDate, setSelectedDate] = useState<string>(TODAY)
  // Filters are remembered per device (utils/feedFilters): restored before the
  // first paint on web, a moment later on native.
  const [chosenFilter, setChosenFilter] = useState<FeedFilter>(() => feedFiltersNow()?.filter ?? DEFAULT_FEED_FILTERS.filter)
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilterValue>(() => feedFiltersNow()?.surface ?? DEFAULT_FEED_FILTERS.surface)
  const feedRegion = useFeedRegion()
  const [notifOpen, setNotifOpen] = useState(false)
  const [curWeekPage, setCurWeekPage] = useState(WEEK_CENTER)
  const [curMonthPage, setCurMonthPage] = useState(MONTH_CENTER)
  const [eventsPullRefreshing, setEventsPullRefreshing] = useState(false)
  const { userId: currentUserId, isGuest } = useSession()
  const requireSignIn = useRequireSignIn()
  // A remembered "Mine" waits for an account: guests (and the moment before the session restores) see All.
  const activeFilter = usableFeedFilter(chosenFilter, !!currentUserId)

  const filtersTouchedRef = useRef(false)
  useEffect(() => {
    if (feedFiltersNow()) return
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
    const current = TODAY.substring(0, 7)
    loadMonthSpan(current, addMonths(current, 3))
  }, [isMobile, loadMonthSpan])

  // Force-reload visible months after create/edit (cached data stays on screen meanwhile).
  // Focus/foreground refetch-when-stale and the signed-in-user change live in the hook.
  useEffect(() => {
    if (eventsRefreshTick > 0) {
      visibleMonths.forEach(m => { loadMonth(m, true) })
    }
  }, [eventsRefreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // The month immediately after the last loaded month — what to fetch on scroll-to-bottom
  const nextScrollMonth = useMemo(
    () => addMonths(loadedMonths[loadedMonths.length - 1] ?? TODAY.substring(0, 7), 1),
    [loadedMonths],
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

  const scrollRef   = useRef<ScrollView>(null)
  const sectionListRef = useRef<SectionList<EventWithDetails, DateSection>>(null)
  const sectionYRef = useRef<Record<string, number>>({})
  const lastScrollY = useRef(0)

  // ── Doc-scroll mode (mobile web): the document/body scrolls instead of the
  // inner ScrollView so browser URL bars collapse. Window listener handles
  // load-more (tab-bar hide/show is centralized in the tabs shell).
  const docScrollRef        = useRef(docScrollActive)
  docScrollRef.current      = docScrollActive
  const feedContentRef      = useRef<View>(null)

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

  const sections: DateSection[] = useMemo(() => {
    const filtered = events.filter(event => {
      // Outside sessions (Schelagg) only for the viewer's region: home city, else the pilot default.
      if (event._external && event._external.region !== feedRegion) return false
      if (surfaceFilter !== 'any' && surfaceOf(event) !== surfaceFilter) return false
      if (activeFilter === 'all') return true
      if (activeFilter === 'mine') return !!currentUserId && myStatusFor(event, currentUserId) !== null
      const tags = event.event_tags?.map(et => et.tags.name.toLowerCase()) ?? []
      if (activeFilter === 'open_play')  return tags.some(t => t.includes('open play') || t.includes('open-play'))
      if (activeFilter === 'tournament') return tags.some(t => t.includes('tournament'))
      if (activeFilter === 'not_full') {
        // Capacity at other venues is unknown, so they can't be called "not full".
        if (event._external) return false
        if (!event.max_attendees) return true
        const count = event.event_attendees_attending?.[0]
          ? Number(event.event_attendees_attending[0].count)
          : 0
        return count < event.max_attendees
      }
      return true
    })
    const grouped: Record<string, EventWithDetails[]> = {}
    for (const event of [...filtered].sort((a, b) => a.event_date.localeCompare(b.event_date))) {
      // Local date, so the section header matches the time shown on the event
      // card — and matches the calendar dot, which uses the same helper.
      const date = eventLocalDateKey(event.event_date)
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(event)
    }
    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) => a.event_date.localeCompare(b.event_date))
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, data]) => ({ date, data }))
  }, [events, activeFilter, surfaceFilter, currentUserId, feedRegion])

  // "You're going" rail. Derived from events already in memory — no extra query
  // on the happy path, and it re-derives whenever the feed does, so an RSVP made
  // from a feed card lands in the rail without a manual refresh.
  const myUpcoming = useMyUpcomingEvents(events, currentUserId)

  const railNode = (
    <MyEventsRail
      items={myUpcoming}
      onPressEvent={eventId => router.push(routes.event(eventId))}
      // "See all" switches the feed to Mine rather than growing the rail — one
      // place to look for the long list, and the rail stays above the fold.
      onSeeAll={() => selectFilter('mine')}
    />
  )

  const markedDates = useMemo(() => buildMarkedDates(events, selectedDate), [events, selectedDate])

  const selectDate = useCallback((dateStr: string) => {
    setSelectedDate(dateStr)
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
  }, [sections])

  const goPrevWeek  = useCallback(() => setCurWeekPage(p => p - 1), [])
  const goNextWeek  = useCallback(() => setCurWeekPage(p => p + 1), [])
  const goPrevMonth = useCallback(() => setCurMonthPage(p => p - 1), [])
  const goNextMonth = useCallback(() => setCurMonthPage(p => p + 1), [])

  const openNotifItem = useCallback(
    async (item: Notification) => {
      setNotifOpen(false)
      try {
        if (!item.read_at) await markRead(item.id)
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

  // "Mine" means nothing without an account.
  const visibleChips = useMemo(
    () => (currentUserId ? FILTER_CHIPS : FILTER_CHIPS.filter(c => c.id !== 'mine')),
    [currentUserId],
  )

  // Flatten all events from sections for desktop grid layout
  const allEvents = useMemo(() => sections.flatMap(s => s.data), [sections])
  // "Next up" links to an event page, so it skips sessions at other venues.
  const nextClubEvent = useMemo(() => allEvents.find(e => !e._external), [allEvents])

  // Ads: everything goes through useAdsEnabled + planFeedAds; the render paths
  // below only ask "is this sponsored?" and "what follows this item?".
  const showAds = useAdsEnabled()
  const feedAds = useFeedAds(showAds)
  const adPlan = useMemo(() => planFeedAds(allEvents, feedAds, showAds), [allEvents, feedAds, showAds])
  const sponsoredIds = useMemo(() => new Set(showAds ? feedAds?.sponsoredEventIds ?? [] : []), [showAds, feedAds])

  const headerRight = isGuest ? <SignInButton /> : (
    <IconButton
      icon={notifOpen ? 'notifications' : 'notifications-outline'}
      label="Notifications"
      active={notifOpen}
      badge={unreadCount > 0}
      onPress={toggleNotifPanel}
    />
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
          chips={visibleChips}
          active={activeFilter}
          onSelect={selectFilter}
          mineCount={myUpcoming.length}
          wide={!isMobile}
        />
        <SurfaceFilter active={surfaceFilter} onSelect={selectSurface} wide={!isMobile} />
      </TourTarget>
      {activeFilter === 'tournament' && <AllTournamentsLink onPress={() => router.push(routes.tournaments())} />}
      {staleNotice}
    </>
  )

  // Shown in place of the cards when the (filtered) feed is empty. An error
  // only counts when there's nothing loaded at all: with data cached, a failed
  // refetch keeps it on screen.
  const feedEmpty = (
    <FeedEmpty
      loading={loading}
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
        <ScrollView
          ref={scrollRef}
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
          {allEvents.length === 0 ? feedEmpty : (
            <>
              {Object.entries(
                sections.reduce<Record<string, EventWithDetails[]>>((acc, section) => {
                  const month = section.date.substring(0, 7)
                  ;(acc[month] ??= []).push(...section.data)
                  return acc
                }, {})
              ).map(([month, monthEvents]) => {
                const [y, m] = month.split('-').map(Number)
                const d = new Date(y, m - 1, 1)
                const isCurrentMonth = month === TODAY.substring(0, 7)
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
                        const renderRowCard = (event: EventWithDetails) => (
                          <RowEventCard
                            event={event}
                            currentUserId={currentUserId}
                            onRsvp={event._isTournament ? undefined : handleRsvp}
                            rsvpPending={isRsvpPending(event.id)}
                          />
                        )
                        return (
                          <React.Fragment key={item.id}>
                            <View style={{ width: 'calc(50% - 5px)' as any }}>
                              {sponsoredIds.has(item.id) && <SponsoredLabel />}
                              {item._external ? <ExternalSessionCard session={item._external} /> : renderRowCard(item)}
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
                  </View>
                )
              })}

              {loading && (
                <ActivityIndicator style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primary} />
              )}
            </>
          )}
          </View>
        </ScrollView>

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
            {/* Mini calendar */}
            <Text style={feedStyles.railLabel}>This week</Text>
            <TourTarget id={TOUR_TARGETS.calendar} style={{ backgroundColor: theme.colors.background, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 20, overflow: 'hidden' }}>
              <MonthGridContent
                month={monthForIdx(curMonthPage)}
                selectedDate={selectedDate}
                markedDates={markedDates}
                onSelectDate={selectDate}
                onPrevMonth={goPrevMonth}
                onNextMonth={goNextMonth}
              />
            </TourTarget>

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
      </View>
    )
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  return (
    // Doc-scroll mode: auto height so the feed extends the document (body scrolls)
    <View style={docScrollActive ? [shared.screen, { flex: undefined } as any] : shared.screen}>
      <View
        onTouchStart={blockPager}
        onTouchEnd={unblockPager}
        onTouchCancel={unblockPager}
      >
        <EventsHeader wide={false} right={headerRight} />

        {/* Calendar strip */}
        <TourTarget id={TOUR_TARGETS.calendar}>
          <WeekPager
            curWeekPage={curWeekPage}
            selectedDate={selectedDate}
            markedDates={markedDates}
            onSelectDate={selectDate}
            onPrevWeek={goPrevWeek}
            onNextWeek={goNextWeek}
          />
        </TourTarget>

        {filterChips}
      </View>

      {(() => {
        const emptyOrLoading = sections.length === 0 ? feedEmpty : null

        const renderSectionHeader = (section: DateSection) => (
          <View
            style={feedStyles.sectionHeader}
            onLayout={e => { sectionYRef.current[section.date] = e.nativeEvent.layout.y }}
          >
            <Text style={feedStyles.sectionDate}>{formatDayLabel(section.date)}</Text>
            <Text style={feedStyles.sectionCountText}>{section.data.length} {section.data.length === 1 ? 'event' : 'events'}</Text>
          </View>
        )

        const renderCard = (item: EventWithDetails) => (
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            {sponsoredIds.has(item.id) && <SponsoredLabel />}
            {item._external ? (
              <ExternalSessionCard session={item._external} />
            ) : (
              <EventCard
                event={item}
                currentUserId={currentUserId}
                onRsvp={item._isTournament ? undefined : handleRsvp}
                rsvpPending={isRsvpPending(item.id)}
              />
            )}
          </View>
        )

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
                <React.Fragment key={`sponsored-${ad.event.id}`}>{renderCard(ad.event)}</React.Fragment>
              ))}
            </>
          )
        }

        // Doc-scroll mode: plain View in document flow — the BODY scrolls
        // (window scroll listener above handles load-more + tab bar hide).
        // Keep full tree mounted so Safari/Chrome can collapse URL bars.
        if (docScrollActive) {
          return (
            <View ref={feedContentRef} style={{ paddingBottom: tabBarHeight + 32 }}>
              <DocPullToRefresh {...refreshControl.props} />
              <View style={{ paddingHorizontal: theme.spacing.lg }}>{railNode}</View>
              <View testID="events-feed">
              {emptyOrLoading ?? sections.map(section => (
                <View key={section.date} onLayout={e => { sectionYRef.current[section.date] = e.nativeEvent.layout.y }}>
                  {renderSectionHeader(section)}
                  {section.data.map(item => (
                    <React.Fragment key={item.id}>{renderEvent(item)}</React.Fragment>
                  ))}
                </View>
              ))}
              {loading && sections.length > 0 && (
                <ActivityIndicator style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primary} />
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
            renderSectionHeader={({ section }) => renderSectionHeader(section)}
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
                ? <ActivityIndicator style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primary} />
                : null
            }
            refreshControl={refreshControl}
          />
        )
      })()}

      {notificationPopup}
    </View>
  )
}

// ─── Shared pager logic ───────────────────────────────────────────────────────
//
// useNativeDriver: true keeps week/month strip swipes on the UI thread (same as
// the main tab Pager). stopAnimation still receives the current value via callback.
function usePager(
  widthRef: React.MutableRefObject<number>,
  translateX: Animated.Value,
  onPrevRef: React.MutableRefObject<() => void>,
  onNextRef: React.MutableRefObject<() => void>,
) {
  const internalNavRef = useRef(false)

  function snap(toValue: number, onComplete?: () => void) {
    translateX.stopAnimation()
    Animated.spring(translateX, { toValue, useNativeDriver: true, tension: 60, friction: 11 })
      .start(({ finished }) => {
        if (finished && onComplete) {
          internalNavRef.current = true
          onComplete()
        }
      })
  }

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
    onPanResponderGrant: () => {
      translateX.stopAnimation(value => { translateX.setValue(value) })
    },
    onPanResponderMove: (_, { dx }) => {
      translateX.setValue(-widthRef.current + dx)
    },
    onPanResponderRelease: (_, { dx, vx }) => {
      const w = widthRef.current
      if      (dx < -w * 0.3 || vx < -0.5) snap(-w * 2, () => onNextRef.current())
      else if (dx >  w * 0.3 || vx >  0.5) snap(0,      () => onPrevRef.current())
      else                                   snap(-w)
    },
    onPanResponderTerminate: () => {
      translateX.stopAnimation(value => { translateX.setValue(value) })
      Animated.spring(translateX, { toValue: -widthRef.current, useNativeDriver: true, tension: 60, friction: 11 }).start()
    },
  })).current

  const snapToNext = useCallback(() => snap(-widthRef.current * 2, () => onNextRef.current()), [])
  const snapToPrev = useCallback(() => snap(0,                      () => onPrevRef.current()), [])

  return { panResponder, snapToNext, snapToPrev, internalNavRef }
}

// ─── Week Strip Content ───────────────────────────────────────────────────────

type WeekStripContentProps = {
  weekDays: Date[]
  selectedDate: string
  markedDates: Record<string, any>
  onSelectDate: (date: string) => void
  onPrevWeek: () => void
  onNextWeek: () => void
}

const DAY_ABBREVS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Width a three-letter day name ("WED") needs at 1x; narrower cells (small phones, large text) get "We". */
const WEEK_DAY_NAME_WIDTH = 30

const WeekStripContent = memo(function WeekStripContent({ weekDays, selectedDate, markedDates, onSelectDate, onPrevWeek, onNextWeek }: WeekStripContentProps) {
  const [rowWidth, setRowWidth] = useState(0)
  const { appScale, osScale } = useTextScale()
  const textScale = Math.min(appScale * osScale, TIGHT_TEXT_SCALE)
  const compact = rowWidth > 0 && (rowWidth - 6 * 6) / 7 < WEEK_DAY_NAME_WIDTH * textScale
  const dayNames = compact ? DAY_LABELS : DAY_ABBREVS
  return (
    <View style={{ paddingBottom: theme.spacing.sm, paddingTop: theme.spacing.xs }}>
      <View onLayout={e => setRowWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {weekDays.map(day => {
          // `day` is a local-midnight Date; toISOString() would shift it to the
          // previous day for any viewer at a positive UTC offset.
          const dateStr = localDateKey(day)
          const isSelected = dateStr === selectedDate
          const isToday = dateStr === TODAY
          const dots = markedDates[dateStr]?.marked ? (markedDates[dateStr]?.count ?? 1) : 0
          return (
            <TouchableOpacity
              key={dateStr}
              onPress={() => onSelectDate(dateStr)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                borderWidth: isSelected ? 0 : 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Text numberOfLines={1} maxFontSizeMultiplier={TIGHT_TEXT_SCALE} style={{
                fontFamily: theme.fonts.body,
                fontSize: theme.font.size.xs,
                fontWeight: theme.font.weight.bold,
                letterSpacing: compact ? 0 : 0.8,
                color: isSelected ? theme.colors.white : theme.colors.subtext,
                opacity: isSelected ? 0.7 : 1,
              }}>
                {dayNames[day.getDay()]}
              </Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={compact ? COMPACT_TEXT_SCALE : TIGHT_TEXT_SCALE} style={{
                fontFamily: theme.fonts.display,
                fontSize: theme.font.heading.sm,
                lineHeight: 22,
                color: isSelected ? theme.colors.white : isToday ? theme.colors.primary : theme.colors.text,
              }}>
                {day.getDate()}
              </Text>
              <View style={{ flexDirection: 'row', gap: 2, height: 4, alignItems: 'center' }}>
                {dots > 0 && Array.from({ length: Math.min(dots, 3) }).map((_, i) => (
                  <View key={i} style={{
                    width: 4, height: 4, borderRadius: 2,
                    backgroundColor: isSelected ? theme.colors.accent : theme.colors.primary,
                  }} />
                ))}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
})

// ─── Month Grid Content ───────────────────────────────────────────────────────
// Custom month calendar built from plain Views — no third-party library,
// no remounting, no loading flash. Same interaction model as WeekStripContent.

type MonthGridContentProps = {
  month: string  // "YYYY-MM"
  selectedDate: string
  markedDates: Record<string, any>
  onSelectDate: (date: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}

const MonthGridContent = memo(function MonthGridContent({ month, selectedDate, markedDates, onSelectDate, onPrevMonth, onNextMonth }: MonthGridContentProps) {
  const [year, mon] = month.split('-').map(Number)
  const monthLabel  = new Date(year, mon - 1, 15).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const startOffset = new Date(year, mon - 1, 1).getDay()
  const daysInMonth = new Date(year, mon, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length < 42) cells.push(null)
  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

  return (
    <View style={{ backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.sm }}>
        <TouchableOpacity onPress={onPrevMonth} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, color: theme.colors.text }}>
          {monthLabel}
        </Text>
        <TouchableOpacity onPress={onNextMonth} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      {/* Day-of-week labels */}
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.xs, fontWeight: theme.font.weight.bold, letterSpacing: 0.8, color: theme.colors.subtext }}>
            {d}
          </Text>
        ))}
      </View>
      {/* Day grid */}
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row' }}>
          {row.map((day, di) => {
            if (day === null) return <View key={di} style={{ flex: 1, height: 44 }} />
            const dateStr    = `${month}-${String(day).padStart(2, '0')}`
            const isSelected = dateStr === selectedDate
            const isToday    = dateStr === TODAY
            const hasEvent   = !!markedDates[dateStr]?.marked
            return (
              <TouchableOpacity
                key={di}
                onPress={() => onSelectDate(dateStr)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 3 }}
              >
                <View style={{
                  width: 34, height: 34, borderRadius: 10,
                  backgroundColor: isSelected ? theme.colors.primary : isToday ? theme.colors.primarySoft : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{
                    fontFamily: theme.fonts.display,
                    fontSize: theme.font.size.md,
                    color: isSelected ? theme.colors.white : isToday ? theme.colors.primary : theme.colors.text,
                  }}>
                    {day}
                  </Text>
                </View>
                <View style={{ height: 5, marginTop: 1, alignItems: 'center', justifyContent: 'center' }}>
                  {hasEvent && (
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? theme.colors.white : theme.colors.primary, opacity: isSelected ? 0.8 : 1 }} />
                  )}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </View>
  )
})

// ─── Week Pager ──────────────────────────────────────────────────────────────

type WeekPagerProps = {
  curWeekPage: number
  selectedDate: string
  markedDates: Record<string, any>
  onSelectDate: (date: string) => void
  onPrevWeek: () => void
  onNextWeek: () => void
}

function WeekPager({ curWeekPage, selectedDate, markedDates, onSelectDate, onPrevWeek, onNextWeek }: WeekPagerProps) {
  const [width, setWidth] = useState(0)
  const widthRef = useRef(0)
  const translateX = useRef(new Animated.Value(0)).current
  const onPrevRef = useRef(onPrevWeek)
  const onNextRef = useRef(onNextWeek)
  onPrevRef.current = onPrevWeek
  onNextRef.current = onNextWeek

  const { panResponder, snapToPrev, snapToNext, internalNavRef } = usePager(widthRef, translateX, onPrevRef, onNextRef)

  useLayoutEffect(() => {
    const fromSwipe = internalNavRef.current
    internalNavRef.current = false
    if (!fromSwipe) translateX.stopAnimation()
    if (widthRef.current > 0) translateX.setValue(-widthRef.current)
  }, [curWeekPage])

  return (
    <View
      style={{ overflow: 'hidden' }}
      onLayout={e => {
        const w = e.nativeEvent.layout.width
        widthRef.current = w
        if (w !== width) { setWidth(w); translateX.setValue(-w) }
      }}
      {...panResponder.panHandlers}
    >
      {width > 0 && (
        <Animated.View style={{ flexDirection: 'row', width: width * 3, transform: [{ translateX }] }}>
          {([-1, 0, 1] as const).map(offset => (
            <View key={offset} style={{ width, paddingHorizontal: theme.spacing.lg }}>
              <WeekStripContent
                weekDays={getWeekDays(weekForIdx(curWeekPage + offset))}
                selectedDate={selectedDate}
                markedDates={markedDates}
                onSelectDate={onSelectDate}
                onPrevWeek={snapToPrev}
                onNextWeek={snapToNext}
              />
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function offsetDate(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function buildMarkedDates(events: EventWithDetails[], selectedDate: string) {
  const marks: Record<string, { marked?: boolean; dotColor?: string; selected?: boolean; selectedColor?: string; selectedDotColor?: string }> = {}
  for (const event of events) {
    // Must be the viewer's local date, not the raw UTC slice — a 7pm CDT event
    // is stored as the next day in UTC and would dot the wrong square.
    const day = eventLocalDateKey(event.event_date)
    marks[day] = { marked: true, dotColor: theme.colors.primary }
  }
  marks[selectedDate] = {
    ...marks[selectedDate],
    selected: true,
    selectedColor: theme.colors.primary,
    selectedDotColor: theme.colors.white,
  }
  return marks
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

function formatDayLabel(dateString: string): string {
  if (dateString === TODAY) return 'Today'
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  if (dateString === tomorrowKey) return 'Tomorrow'
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
