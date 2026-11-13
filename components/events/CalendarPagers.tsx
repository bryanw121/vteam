/**
 * The Events calendar (#217, moved out of the Events screen unchanged): the
 * week strip and month grid, each a three-page pager. Inner gesture handlers
 * use the bubble phase so they win over the tab Pager (see CLAUDE.md
 * "Gesture layering"); swiping is behind SWIPE_NAVIGATION.calendar.
 */
import React, { useState, useRef, useCallback, memo, useLayoutEffect } from 'react'
import { View, TouchableOpacity, PanResponder, Animated, StyleSheet } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { COMPACT_TEXT_SCALE, SWIPE_NAVIGATION, TIGHT_TEXT_SCALE, theme } from '../../constants'
import { useTextScale } from '../../contexts/textScale'
import { useToday } from '../../hooks/useToday'
import { weekMonthLabel } from '../../utils/monthKeys'
import { localDateKey } from '../../utils'
import { getWeekDays, weekForIdx } from '../../utils/calendarWeeks'
import type { MonthGridContentProps, WeekPagerProps, WeekStripContentProps } from '../../types'

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

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

const DAY_ABBREVS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Width a three-letter day name ("WED") needs at 1x; narrower cells (small phones, large text) get "We". */
const WEEK_DAY_NAME_WIDTH = 30

const WeekStripContent = memo(function WeekStripContent({ weekDays, selectedDate, markedDates, onSelectDate, onPrevWeek, onNextWeek }: WeekStripContentProps) {
  const [rowWidth, setRowWidth] = useState(0)
  const today = useToday()
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
          const isToday = dateStr === today
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

export const MonthGridContent = memo(function MonthGridContent({ month, selectedDate, markedDates, onSelectDate, onPrevMonth, onNextMonth }: MonthGridContentProps) {
  const today = useToday()
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
            const isToday    = dateStr === today
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

export function WeekPager({ curWeekPage, selectedDate, markedDates, onSelectDate, onPrevWeek, onNextWeek }: WeekPagerProps) {
  const [width, setWidth] = useState(0)
  const widthRef = useRef(0)
  const translateX = useRef(new Animated.Value(0)).current
  const onPrevRef = useRef(onPrevWeek)
  const onNextRef = useRef(onNextWeek)
  onPrevRef.current = onPrevWeek
  onNextRef.current = onNextWeek

  const { panResponder, snapToPrev, snapToNext, internalNavRef } = usePager(widthRef, translateX, onPrevRef, onNextRef)

  // The arrows change the week at once (so the label updates and quick taps
  // all count), then slide the new week in from the side it came from.
  const slideFromRef = useRef<1 | -1 | null>(null)
  const stepWeek = useCallback((dir: 1 | -1) => {
    slideFromRef.current = dir
    if (dir > 0) onNextRef.current()
    else onPrevRef.current()
  }, [])

  useLayoutEffect(() => {
    const fromSwipe = internalNavRef.current
    internalNavRef.current = false
    const slide = slideFromRef.current
    slideFromRef.current = null
    if (!fromSwipe) translateX.stopAnimation()
    const w = widthRef.current
    if (w <= 0) return
    if (slide) {
      // The week just left sits one page to the side: start there, settle on the middle page.
      translateX.setValue(slide > 0 ? 0 : -2 * w)
      Animated.spring(translateX, { toValue: -w, useNativeDriver: true, tension: 60, friction: 11 }).start()
    } else {
      translateX.setValue(-w)
    }
  }, [curWeekPage])

  const monthLabel = weekMonthLabel(weekForIdx(curWeekPage))

  return (
    <View>
      {/* Which month the strip is on. */}
      <Text
        testID="week-month-label"
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        numberOfLines={1}
        style={weekNavStyles.month}
      >
        {monthLabel}
      </Text>
      {/* ‹ days › : arrows either side of the week step it a week at a time. */}
      <View style={weekNavStyles.row}>
        <TouchableOpacity
          testID="week-prev"
          onPress={() => stepWeek(-1)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          style={weekNavStyles.arrow}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View
          style={{ flex: 1, overflow: 'hidden' }}
          onLayout={e => {
            const w = e.nativeEvent.layout.width
            widthRef.current = w
            if (w !== width) { setWidth(w); translateX.setValue(-w) }
          }}
          {...(SWIPE_NAVIGATION.calendar ? panResponder.panHandlers : {})}
        >
          {width > 0 && (
            <Animated.View style={{ flexDirection: 'row', width: width * 3, transform: [{ translateX }] }}>
              {([-1, 0, 1] as const).map(offset => (
                <View key={offset} style={{ width }}>
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
        <TouchableOpacity
          testID="week-next"
          onPress={() => stepWeek(1)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Next week"
          style={weekNavStyles.arrow}
        >
          <Ionicons name="chevron-forward" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export const weekNavStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  arrow: {
    width: 32,
    height: 44,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  month: {
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    fontFamily: theme.fonts.display,
    fontSize: theme.font.size.lg,
    color: theme.colors.text,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  today: {
    paddingHorizontal: theme.spacing.md,
    height: 38,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayLabel: {
    fontFamily: theme.fonts.bodySemiBold,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.primaryText,
  },
})
