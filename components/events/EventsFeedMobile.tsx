/**
 * The Events tab on phones and narrow web (#217 part 4): header, week strip,
 * chips, then the feed by day. Three scrollers: the document itself on narrow
 * web (doc-scroll mode), a ScrollView for an empty feed, a SectionList
 * otherwise. Moved as is from the screen.
 */
import React, { memo, useRef } from 'react'
import { Platform, ScrollView, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { DocPullToRefresh } from '../RefreshControl'
import { EventCard } from '../EventCard'
import { ExternalSessionCard } from '../ExternalSessionCard'
import { ExternalProgramCard } from '../ExternalProgramCard'
import { FeedBanner } from '../ads/FeedBanner'
import { SponsoredLabel } from '../ads/SponsoredLabel'
import { TourTarget } from '../tour/TourTarget'
import { EventsHeader } from './EventsHeader'
import { FeedItemShell, HiddenCountRow } from './FeedHiding'
import { WeekPager, weekNavStyles } from './CalendarPagers'
import { myStatusFor } from '../../hooks/useMyUpcomingEvents'
import { TIGHT_TEXT_SCALE, TOUR_TARGETS, shared, theme } from '../../constants'
import { dayLabel } from '../../utils'
import { WEEK_CENTER } from '../../utils/calendarWeeks'
import type { EventWithDetails, EventsFeedMobileProps, FeedCardContext, FeedDaySection } from '../../types'

const PAD = { paddingHorizontal: theme.spacing.lg }

/** `menu`: the ⋯ hide button, for feed items that aren't the player's own (and not promoted slots). */
function MobileCard({ item, cards, menu = true }: { item: EventWithDetails; cards: FeedCardContext; menu?: boolean }) {
  const { currentUserId } = cards
  const withMenu = menu && !(currentUserId && myStatusFor(item, currentUserId) !== null)
  const card = item._external ? (
    <ExternalSessionCard session={item._external} menuInset={withMenu} />
  ) : item._program ? (
    <ExternalProgramCard program={item._program} menuInset={withMenu} />
  ) : (
    <EventCard
      event={item}
      currentUserId={currentUserId}
      onRsvp={item._isTournament ? undefined : cards.onRsvp}
      rsvpPending={cards.isRsvpPending(item.id)}
      friendsGoing={cards.friendsGoing.get(item.id)}
      forecast={cards.forecasts.get(item.id)}
      menuInset={withMenu}
    />
  )
  return (
    <View style={PAD}>
      {cards.sponsoredIds.has(item.id) && <SponsoredLabel />}
      {withMenu ? (
        <FeedItemShell
          onMore={() => cards.onMore(item)}
          moreLabel={`Hide options for ${item.title}`}
          hidden={cards.hiddenItemIds.has(item.id)}
          onUnhide={() => cards.onUnhide(item)}
        >
          {card}
        </FeedItemShell>
      ) : card}
    </View>
  )
}

/** The card, then any ads planned after it (planFeedAds). */
function FeedEvent({ item, cards }: { item: EventWithDetails; cards: FeedCardContext }) {
  const ads = cards.adPlan.get(item.id)
  if (!ads) return <MobileCard item={item} cards={cards} />
  return (
    <>
      <MobileCard item={item} cards={cards} />
      {ads.map(ad => ad.kind === 'banner' ? (
        <View key={`ad-${ad.banner.id}`} style={PAD}>
          <FeedBanner banner={ad.banner} />
        </View>
      ) : (
        <MobileCard key={`sponsored-${ad.event.id}`} item={ad.event} cards={cards} menu={false} />
      ))}
    </>
  )
}

export const EventsFeedMobile = memo(function EventsFeedMobile(p: EventsFeedMobileProps) {
  const { sections, cards, sectionYRef, refreshControl } = p
  const lastScrollY = useRef(0)
  const emptyOrLoading = sections.length === 0 ? p.feedEmpty : null
  const footerSpinner = p.loading && sections.length > 0
    ? <Spinner style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primary} />
    : null

  const renderSectionHeader = (section: FeedDaySection) => (
    <View
      style={styles.sectionHeader}
      onLayout={e => { sectionYRef.current[section.date] = e.nativeEvent.layout.y }}
    >
      <Text style={styles.sectionDate} testID={`feed-day-${section.date}`}>{dayLabel(section.date, p.today)}</Text>
      {section.data.length > 0 && (
        <Text style={styles.sectionCountText}>{section.data.length} {section.data.length === 1 ? 'event' : 'events'}</Text>
      )}
    </View>
  )

  const renderSectionFooter = (section: FeedDaySection) => (
    section.hiddenCount > 0 ? (
      <View style={PAD}>
        <HiddenCountRow count={section.hiddenCount} revealed={section.revealed} onToggle={() => p.onToggleReveal(section.date)} />
      </View>
    ) : null
  )

  const railRow = <View style={PAD}>{p.rail}</View>

  let feed: React.ReactNode
  if (p.docScrollActive) {
    // Doc-scroll mode: plain View in document flow — the BODY scrolls (the
    // screen's window scroll listener handles load-more; the tabs shell the tab
    // bar). Keep the full tree mounted so Safari/Chrome can collapse URL bars.
    feed = (
      <View ref={p.feedContentRef} onLayout={p.feedDocLayout} style={{ paddingBottom: p.tabBarHeight + 32 }}>
        <DocPullToRefresh {...refreshControl.props} />
        {railRow}
        <View testID="events-feed">
        {emptyOrLoading ?? sections.map(section => (
          <View key={section.date} onLayout={e => { sectionYRef.current[section.date] = e.nativeEvent.layout.y }}>
            {renderSectionHeader(section)}
            {section.data.map(item => <FeedEvent key={item.id} item={item} cards={cards} />)}
            {renderSectionFooter(section)}
          </View>
        ))}
        {footerSpinner}
        </View>
      </View>
    )
  } else if (emptyOrLoading) {
    feed = (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: p.tabBarHeight + 32 }}
        refreshControl={refreshControl}
      >
        {/* The rail is derived from all loaded events, so it can be
            non-empty even when the active filter matches nothing. */}
        {railRow}
        {emptyOrLoading}
      </ScrollView>
    )
  } else {
    feed = (
      <SectionList
        ref={p.sectionListRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: p.tabBarHeight + 32 }}
        sections={sections}
        keyExtractor={item => item.id}
        // No `events-feed` testID here on purpose: the rail lives in
        // ListHeaderComponent, so tagging the list would include it and
        // defeat the scoping. The two paths e2e actually drives (desktop and
        // doc-scroll) keep the rail outside their tagged wrapper.
        ListHeaderComponent={railRow}
        renderItem={({ item }) => <FeedEvent item={item} cards={cards} />}
        extraData={cards}
        renderSectionHeader={({ section }) => renderSectionHeader(section)}
        renderSectionFooter={({ section }) => renderSectionFooter(section)}
        stickySectionHeadersEnabled={false}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        onEndReached={() => { p.onNearBottom() }}
        onEndReachedThreshold={0.5}
        scrollEventThrottle={64}
        onScroll={({ nativeEvent: { contentOffset } }) => {
          if (Platform.OS === 'web') {
            const y = contentOffset.y
            const diff = y - lastScrollY.current
            lastScrollY.current = y
            if (y <= 60) { p.onScrollTabBar(false); return }
            if (Math.abs(diff) > 5) p.onScrollTabBar(diff > 0)
          }
        }}
        ListFooterComponent={footerSpinner ?? undefined}
        refreshControl={refreshControl}
      />
    )
  }

  return (
    // Doc-scroll mode: auto height so the feed extends the document (body scrolls)
    <View ref={p.screenRootRef} style={p.docScrollActive ? [shared.screen, { flex: undefined }] : shared.screen}>
      <View
        onTouchStart={p.onHeaderTouchStart}
        onTouchEnd={p.onHeaderTouchEnd}
        onTouchCancel={p.onHeaderTouchEnd}
      >
        <EventsHeader
          wide={false}
          right={p.curWeekPage === WEEK_CENTER ? p.headerRight : (
            <View style={weekNavStyles.headerRight}>
              <TouchableOpacity
                testID="week-today"
                onPress={p.onToday}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Go to this week"
                style={weekNavStyles.today}
              >
                <Text maxFontSizeMultiplier={TIGHT_TEXT_SCALE} style={weekNavStyles.todayLabel}>Today</Text>
              </TouchableOpacity>
              {p.headerRight}
            </View>
          )}
        />

        {/* Calendar strip (not under the Tournament filter: that list isn't about a day) */}
        {p.showCalendar && <TourTarget id={TOUR_TARGETS.calendar}>
          <WeekPager
            curWeekPage={p.curWeekPage}
            selectedDate={p.selectedDate}
            markedDates={p.markedDates}
            onSelectDate={p.onSelectDate}
            onPrevWeek={p.onPrevWeek}
            onNextWeek={p.onNextWeek}
          />
        </TourTarget>}

        {p.filterChips}
      </View>

      {feed}

      {p.overlays}
    </View>
  )
})

const styles = StyleSheet.create({
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
})
