import React, { memo, useMemo } from 'react'
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { Text } from './ui/Text'
import { theme } from '../constants'
import { parseEventDate } from '../utils'
import { MY_EVENTS_RAIL_CAP } from '../hooks/useMyUpcomingEvents'
import { MyEventStatus, MyUpcomingEvent } from '../types'

/**
 * "You're going" — a pinned rail of the events the viewer is committed to,
 * above the date feed.
 *
 * The date feed is strictly chronological because the calendar drives it
 * (tapping Aug 16 scrolls to the Aug 16 section), so registered events can't be
 * hoisted out of date order. This rail is the shortcut instead: the same events
 * still appear in their date sections below.
 */

type StatusStyle = { stripe: string; label: string; tint: string }

/**
 * The left stripe carries state at a glance, so the viewer doesn't have to read
 * the pill on each card to tell "I'm in" from "I might be in".
 */
function statusStyle(status: MyEventStatus, waitlistPosition: number | null): StatusStyle {
  switch (status) {
    case 'hosting':
      return { stripe: theme.colors.primary, label: 'HOSTING', tint: theme.colors.primary }
    case 'attending':
      return { stripe: theme.colors.cool, label: 'GOING', tint: theme.colors.cool }
    case 'waitlisted':
      return {
        stripe: theme.colors.warning,
        // The position is the thing that decides whether you make other plans —
        // "waitlisted" alone doesn't tell you anything actionable.
        label: waitlistPosition !== null ? `WAITLIST #${waitlistPosition}` : 'WAITLISTED',
        tint: theme.colors.warning,
      }
    case 'requested':
      return { stripe: theme.colors.subtext, label: 'PENDING', tint: theme.colors.subtext }
  }
}

/** "TONIGHT 7:00 PM" / "SAT AUG 16" / "NOW · ends 9:00 PM". */
export function railTimeLabel(iso: string, durationMinutes: number, nowMs: number): string {
  const start = parseEventDate(iso)
  const startMs = start.getTime()
  const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  if (startMs <= nowMs) {
    const end = new Date(startMs + (durationMinutes ?? 0) * 60_000)
    return `NOW · ends ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }

  const now = new Date(nowMs)
  const sameDay =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate()
  if (sameDay) return `TONIGHT ${time}`

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const isTomorrow =
    start.getFullYear() === tomorrow.getFullYear() &&
    start.getMonth() === tomorrow.getMonth() &&
    start.getDate() === tomorrow.getDate()
  if (isTomorrow) return `TOMORROW ${time}`

  // The approved mock reads "SAT AUG 16"; toLocaleDateString emits "Sat, Aug 16".
  return start
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .replace(/,/g, '')
    .toUpperCase()
}

type CardProps = {
  item: MyUpcomingEvent
  nowMs: number
  onPress: (eventId: string) => void
}

const RailCard = memo(function RailCard({ item, nowMs, onPress }: CardProps) {
  const s = statusStyle(item.status, item.waitlistPosition)
  const { event } = item

  return (
    <Pressable
      testID={`my-event-card-${event.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${s.label.toLowerCase()}`}
      onPress={() => onPress(event.id)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.stripe, { backgroundColor: s.stripe }]} />
      <View style={styles.cardBody}>
        <Text style={[styles.when, { color: s.tint }]} numberOfLines={1}>
          {railTimeLabel(event.event_date, event.duration_minutes ?? 0, nowMs)}
        </Text>
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
        {!!event.location && (
          <Text style={styles.location} numberOfLines={1}>{event.location}</Text>
        )}
        <View style={styles.pillRow}>
          <View style={[styles.pill, { borderColor: s.tint }]}>
            <Text style={[styles.pillText, { color: s.tint }]} numberOfLines={1}>{s.label}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  )
})

export type MyEventsRailProps = {
  items: MyUpcomingEvent[]
  onPressEvent: (eventId: string) => void
  onSeeAll: () => void
  /** Pinned by tests; defaults to wall-clock. */
  nowMs?: number
}

export const MyEventsRail = memo(function MyEventsRail({
  items,
  onPressEvent,
  onSeeAll,
  nowMs,
}: MyEventsRailProps) {
  const now = nowMs ?? Date.now()
  const visible = useMemo(() => items.slice(0, MY_EVENTS_RAIL_CAP), [items])

  // Nothing registered → render nothing at all. No header, no empty-state box,
  // no zero badge. A brand-new member sees exactly the pre-rail screen.
  if (items.length === 0) return null

  return (
    <View testID="my-events-rail" style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.dot} />
          <Text style={styles.headerLabel}>YOU'RE GOING · {items.length}</Text>
        </View>
        {items.length > visible.length && (
          <Pressable
            testID="my-events-see-all"
            accessibilityRole="button"
            accessibilityLabel="See all events you're going to"
            onPress={onSeeAll}
            hitSlop={12}
            style={styles.seeAll}
          >
            <Text style={styles.seeAllText}>See all</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {visible.map(item => (
          <RailCard key={item.event.id} item={item} nowMs={now} onPress={onPressEvent} />
        ))}
      </ScrollView>
    </View>
  )
})

const CARD_WIDTH = 196

const styles = StyleSheet.create({
  wrap: {
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSoft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs + 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.cool },
  headerLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    letterSpacing: 1.1,
    color: theme.colors.subtext,
  },
  // ≥44pt tap target without adding visible height: the padding is symmetric
  // and the row's other content is taller than the text alone.
  seeAll: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  seeAllText: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.sm,
    color: theme.colors.primary,
  },
  scrollContent: { gap: theme.spacing.sm, paddingRight: theme.spacing.xs },
  card: {
    width: CARD_WIDTH,
    minHeight: 44,
    flexDirection: 'row',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    overflow: 'hidden',
  },
  stripe: { width: 3 },
  cardBody: { flex: 1, padding: theme.spacing.sm + 2, gap: 3 },
  when: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: theme.fonts.displaySemiBold,
    fontSize: theme.font.size.md,
    lineHeight: 18,
    color: theme.colors.text,
  },
  location: {
    fontFamily: theme.fonts.body,
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
  },
  pillRow: { flexDirection: 'row', marginTop: theme.spacing.xs },
  pill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.xs,
    letterSpacing: 0.5,
  },
})
