/**
 * The Events tab on wide web (#217 part 4): the feed by month in two columns,
 * and a right rail with the mini calendar and Next up. Moved as is from the
 * screen, which builds the shared pieces (header, chips, rail, overlays).
 */
import React, { memo } from 'react'
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from '../ui/Text'
import { Spinner } from '../ui/Spinner'
import { DocScrollView } from '../DocScrollView'
import { RowEventCard } from '../EventCard'
import { ExternalSessionCard } from '../ExternalSessionCard'
import { ExternalProgramCard } from '../ExternalProgramCard'
import { FeedBanner } from '../ads/FeedBanner'
import { SponsoredLabel } from '../ads/SponsoredLabel'
import { TourTarget } from '../tour/TourTarget'
import { FeedItemShell, HiddenCountRow } from './FeedHiding'
import { MonthGridContent } from './CalendarPagers'
import { NextUpCard } from './NextUpCard'
import { myStatusFor } from '../../hooks/useMyUpcomingEvents'
import { TOUR_TARGETS, theme } from '../../constants'
import type { EventWithDetails, EventsFeedDesktopProps, FeedCardContext } from '../../types'

/** Two cards a row, with the 10px gap (a web-only width). */
const HALF = { width: 'calc(50% - 5px)' } as unknown as ViewStyle

/** Sections grouped by month, with each month's hidden count. */
function byMonth(sections: EventsFeedDesktopProps['sections']) {
  return Object.entries(
    sections.reduce<Record<string, { events: EventWithDetails[]; hidden: number }>>((acc, section) => {
      const month = section.date.substring(0, 7)
      const entry = acc[month] ??= { events: [], hidden: 0 }
      entry.events.push(...section.data)
      entry.hidden += section.hiddenCount
      return acc
    }, {}),
  )
}

function RowCard({ event, cards, menuInset = false }: { event: EventWithDetails; cards: FeedCardContext; menuInset?: boolean }) {
  return (
    <RowEventCard
      event={event}
      currentUserId={cards.currentUserId}
      onRsvp={event._isTournament ? undefined : cards.onRsvp}
      rsvpPending={cards.isRsvpPending(event.id)}
      forecast={cards.forecasts.get(event.id)}
      menuInset={menuInset}
      friendsGoing={cards.friendsGoing.get(event.id)}
    />
  )
}

function DesktopFeedItem({ item, cards }: { item: EventWithDetails; cards: FeedCardContext }) {
  const { currentUserId } = cards
  const withMenu = !(currentUserId && myStatusFor(item, currentUserId) !== null)
  const card = item._external
    ? <ExternalSessionCard session={item._external} menuInset={withMenu} />
    : item._program
      ? <ExternalProgramCard program={item._program} menuInset={withMenu} />
      : <RowCard event={item} cards={cards} menuInset={withMenu} />
  return (
    <>
      <View style={HALF}>
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
      {cards.adPlan.get(item.id)?.map(ad => ad.kind === 'banner' ? (
        <View key={`ad-${ad.banner.id}`} style={{ width: '100%' }}>
          <FeedBanner banner={ad.banner} />
        </View>
      ) : (
        <View key={`sponsored-${ad.event.id}`} style={HALF}>
          <SponsoredLabel />
          <RowCard event={ad.event} cards={cards} />
        </View>
      ))}
    </>
  )
}

export const EventsFeedDesktop = memo(function EventsFeedDesktop(p: EventsFeedDesktopProps) {
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
            p.onNearBottom()
          }
        }}
        refreshControl={p.refreshControl}
      >
        {p.header}

        {p.filterChips}

        {p.rail}

        {/* Tagged so e2e can scope feed assertions: the rail deliberately
            ignores the active filter, so a page-wide text count would see it. */}
        <View testID="events-feed">
        {p.sections.length === 0 ? p.feedEmpty : (
          <>
            {byMonth(p.sections).map(([month, { events: monthEvents, hidden: monthHidden }]) => {
              const [y, m] = month.split('-').map(Number)
              const d = new Date(y, m - 1, 1)
              const isCurrentMonth = month === p.today.substring(0, 7)
              const label = isCurrentMonth
                ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + ' · This month'
                : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              return (
                <View key={month} style={{ marginBottom: 32 }}>
                  <Text style={styles.monthLabel}>{label}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {monthEvents.map(item => <DesktopFeedItem key={item.id} item={item} cards={p.cards} />)}
                  </View>
                  <HiddenCountRow count={monthHidden} revealed={p.revealedKeys.has(month)} onToggle={() => p.onToggleReveal(month)} />
                </View>
              )
            })}

            {p.loading && (
              <Spinner style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primary} />
            )}
          </>
        )}
        </View>
      </DocScrollView>

      {/* Right rail */}
      <View style={styles.rightRail}>
        <ScrollView
          contentContainerStyle={{ padding: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={p.refreshControl}
        >
          {/* Mini calendar (not under the Tournament filter: that list isn't about a day) */}
          {p.calendarLabel && <Text style={styles.railLabel}>This week</Text>}
          {p.showCalendar && <TourTarget id={TOUR_TARGETS.calendar} style={styles.miniCalendar}>
            <MonthGridContent
              month={p.month}
              selectedDate={p.selectedDate}
              markedDates={p.markedDates}
              onSelectDate={p.onSelectDate}
              onPrevMonth={p.onPrevMonth}
              onNextMonth={p.onNextMonth}
            />
          </TourTarget>}

          {/* Your next event */}
          {p.nextUp && (
            <>
              <Text style={styles.railLabel}>Next up</Text>
              <NextUpCard event={p.nextUp} onPress={p.onPressNextUp} />
            </>
          )}

        </ScrollView>
      </View>

      {p.overlays}
    </View>
  )
})

const styles = StyleSheet.create({
  monthLabel: {
    fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.heading.sm,
    letterSpacing: -0.4, color: theme.colors.text, marginBottom: 12,
  },
  rightRail: {
    width: 300,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    flexShrink: 0,
  },
  miniCalendar: {
    backgroundColor: theme.colors.background, borderRadius: 16, borderWidth: 1,
    borderColor: theme.colors.border, marginBottom: 20, overflow: 'hidden',
  },
  /** Right-rail section labels ("This week", "Next up"). */
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
