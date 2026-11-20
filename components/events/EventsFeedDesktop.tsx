/**
 * The Events tab on wide web (#217 part 4): the feed by month in two columns,
 * and a right rail with the mini calendar and Next up. Moved as is from the
 * screen, which builds the shared pieces (header, chips, rail, overlays).
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, TouchableOpacity, View, type ViewInstance, type ViewStyle } from 'react-native'
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
import { DESKTOP_DAY_GAMES, TOUR_TARGETS, shared, theme } from '../../constants'
import { collapseDay, dayToScrollTo, desktopFeedMonths, gamesCount } from '../../utils/feedDays'
import type { DesktopFeedDay, EventWithDetails, EventsFeedDesktopProps, FeedCardContext } from '../../types'

/** Two cards a row, with the 10px gap (a web-only width). */
const HALF = { width: 'calc(50% - 5px)' } as unknown as ViewStyle

function RowCard({ event, cards, menuInset = false }: { event: EventWithDetails; cards: FeedCardContext; menuInset?: boolean }) {
  return (
    <RowEventCard
      hideDate
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
    ? <ExternalSessionCard session={item._external} menuInset={withMenu} hideDate />
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

/** "You're going to 2" for the day header, or null. */
function goingLine(day: DesktopFeedDay, userId: string | null): string | null {
  if (!userId) return null
  const n = day.data.filter(e => myStatusFor(e, userId) !== null).length
  return n > 0 ? `You're going to ${n}` : null
}

/** One day: a header that stays in view while its games scroll, then its cards. */
function DaySection({ day, cards, open, onToggleOpen, revealed, onToggleReveal, registerNode }: {
  day: DesktopFeedDay
  cards: FeedCardContext
  open: boolean
  onToggleOpen: (date: string) => void
  revealed: boolean
  onToggleReveal: (key: string) => void
  registerNode: (date: string, node: ViewInstance | null) => void
}) {
  const { shown, more } = collapseDay(day.data, DESKTOP_DAY_GAMES, open, day.label)
  const going = goingLine(day, cards.currentUserId)
  return (
    <View ref={node => registerNode(day.date, node)} style={styles.daySection} testID={`feed-day-${day.date}`}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayLabel} accessibilityRole="header">{day.label}</Text>
        {day.isToday && <Text style={styles.todayPill}>TODAY</Text>}
        {day.data.length > 0 && <Text style={styles.dayCount}>{gamesCount(day.data.length)}</Text>}
        <View style={{ flex: 1 }} />
        {going && <Text style={styles.dayGoing}>{going}</Text>}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {shown.map(item => <DesktopFeedItem key={item.id} item={item} cards={cards} />)}
      </View>
      {more && (
        <TouchableOpacity
          onPress={() => onToggleOpen(day.date)}
          accessibilityRole="button"
          style={shared.feedDayMore}
          testID={`feed-day-more-${day.date}`}
        >
          <Text style={shared.feedDayMoreText}>{more}</Text>
        </TouchableOpacity>
      )}
      <HiddenCountRow count={day.hiddenCount} revealed={revealed} onToggle={() => onToggleReveal(day.date)} />
    </View>
  )
}

export const EventsFeedDesktop = memo(function EventsFeedDesktop(p: EventsFeedDesktopProps) {
  const months = useMemo(() => desktopFeedMonths(p.sections, p.today), [p.sections, p.today])
  const [openDays, setOpenDays] = useState<ReadonlySet<string>>(() => new Set())
  const toggleOpen = useCallback((date: string) => setOpenDays(prev => {
    const next = new Set(prev)
    if (next.has(date)) next.delete(date)
    else next.add(date)
    return next
  }), [])

  // Picking a day in the calendar scrolls to it (or the next day with games). A
  // day in a month that hasn't loaded yet waits for it.
  const nodes = useRef(new Map<string, ViewInstance>())
  const registerNode = useCallback((date: string, node: ViewInstance | null) => {
    if (node) nodes.current.set(date, node)
    else nodes.current.delete(date)
  }, [])
  const pending = useRef<string | null>(null)
  const dayDates = useMemo(() => months.flatMap(m => m.days.map(d => d.date)), [months])
  const tryScroll = useCallback(() => {
    const picked = pending.current
    if (!picked) return
    const target = dayToScrollTo(dayDates, picked)
    const node = target ? nodes.current.get(target) as unknown as HTMLElement | undefined : undefined
    if (!node?.scrollIntoView) return
    pending.current = null
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [dayDates])
  const { scrollToDayRef } = p
  useEffect(() => {
    scrollToDayRef.current = (date: string) => { pending.current = date; tryScroll() }
    return () => { scrollToDayRef.current = null }
  }, [scrollToDayRef, tryScroll])
  useEffect(() => { tryScroll() }, [tryScroll])

  // The day at the top of the list as it scrolls, ringed in the calendar.
  const [inViewDate, setInViewDate] = useState<string | null>(null)
  const scroller = useRef<HTMLElement | null>(null)
  const updateInView = useCallback(() => {
    const first = nodes.current.get(dayDates[0] ?? '') as unknown as HTMLElement | undefined
    if (!first?.getBoundingClientRect) return
    if (!scroller.current?.isConnected) {
      let el: HTMLElement | null = first.parentElement
      while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
      scroller.current = el
    }
    const top = (scroller.current?.getBoundingClientRect().top ?? 0) + 80
    let current: string | null = null
    for (const date of dayDates) {
      const node = nodes.current.get(date) as unknown as HTMLElement | undefined
      if (!node?.getBoundingClientRect) continue
      if (node.getBoundingClientRect().top > top) break
      current = date
    }
    setInViewDate(prev => (prev === current ? prev : current))
  }, [dayDates])
  const counts = useMemo(() => new Map(p.sections.filter(s => s.data.length > 0).map(s => [s.date, s.data.length])), [p.sections])

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
          updateInView()
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
            {months.map(month => (
              <View key={month.month} style={{ marginBottom: 32 }}>
                <Text style={styles.monthLabel}>{month.label}</Text>
                {month.days.map(day => (
                  <DaySection
                    key={day.date}
                    day={day}
                    cards={p.cards}
                    open={openDays.has(day.date)}
                    onToggleOpen={toggleOpen}
                    revealed={p.revealedKeys.has(day.date) || p.revealedKeys.has(month.month)}
                    onToggleReveal={p.onToggleReveal}
                    registerNode={registerNode}
                  />
                ))}
              </View>
            ))}

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
              counts={counts}
              inViewDate={inViewDate}
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

/** The day header stays at the top of the list while its games scroll past (web). */
const STICKY = { position: 'sticky', top: 0, zIndex: 2 } as unknown as ViewStyle

const styles = StyleSheet.create({
  monthLabel: {
    fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.heading.sm,
    letterSpacing: -0.4, color: theme.colors.text, marginBottom: 4,
  },
  daySection: { marginTop: 14 },
  dayHeader: {
    ...STICKY,
    flexDirection: 'row', alignItems: 'baseline', gap: 10,
    paddingTop: 12, paddingBottom: 10,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  dayLabel: { fontFamily: theme.fonts.display, fontWeight: '700', fontSize: theme.font.size.lg, color: theme.colors.text },
  todayPill: {
    fontFamily: theme.fonts.bodyBold, fontSize: theme.font.size.xs, color: theme.colors.accentInk,
    backgroundColor: theme.colors.accent, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  dayCount: { fontFamily: theme.fonts.body, fontSize: theme.font.size.md, color: theme.colors.subtext },
  dayGoing: { fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.cool },
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
