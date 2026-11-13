/**
 * The day picked on the Events tab (#217 part 4): the `?day=` link, the week
 * strip and month grid pages, and scrolling the feed to a picked day (the
 * document on narrow web, the SectionList elsewhere). Moved as is from the screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SectionList, ViewInstance } from 'react-native'
import { useUrlParam } from './useUrlParam'
import { feedDay } from '../utils/urlState'
import { VIEW } from '../utils/urlViews'
import { getWeekStart, idxForMonth, idxForWeek } from '../utils/calendarWeeks'
import type { EventWithDetails, FeedDaySection } from '../types'

export function useFeedDay({ today, sections, docScrollActive, feedContentRef }: {
  today: string
  sections: FeedDaySection[]
  docScrollActive: boolean
  feedContentRef: { current: ViewInstance | null }
}) {
  // The view is in the URL (`/?day=2026-11-14`, utils/urlViews) so a copied link opens it.
  const [linkDay, setUrlDay] = useUrlParam('day', VIEW.feed.day, { tab: 'events' })
  const [selectedDate, setSelectedDate] = useState<string>(() => feedDay(linkDay, today) ?? today)
  const [curWeekPage, setCurWeekPage] = useState(() => idxForWeek(getWeekStart(new Date(selectedDate + 'T00:00:00'))))
  const [curMonthPage, setCurMonthPage] = useState(() => idxForMonth(selectedDate.substring(0, 7)))

  const sectionListRef = useRef<SectionList<EventWithDetails, FeedDaySection>>(null)
  const sectionYRef = useRef<Record<string, number>>({})
  const docScrollRef = useRef(docScrollActive)
  docScrollRef.current = docScrollActive

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
  }, [sections, today, setUrlDay, feedContentRef])

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
  const goPrevMonth = useCallback(() => setCurMonthPage(p => p - 1), [])
  const goNextMonth = useCallback(() => setCurMonthPage(p => p + 1), [])

  // Midnight passed (or the app woke up on a new day): if the player was on
  // "today", follow it to the new day; a date they picked themselves stays.
  const prevTodayRef = useRef(today)
  useEffect(() => {
    const prev = prevTodayRef.current
    prevTodayRef.current = today
    if (prev !== today && selectedDate === prev) selectDate(today)
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    selectedDate, curWeekPage, curMonthPage, selectDate,
    goPrevWeek, goNextWeek, goToday, goPrevMonth, goNextMonth,
    sectionListRef, sectionYRef,
  }
}
