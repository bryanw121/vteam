import { collapseDay, dayLabel, dayToScrollTo, desktopFeedMonths, gamesCount } from '../utils/feedDays'
import type { EventWithDetails, FeedDaySection } from '../types'

const ev = (id: string) => ({ id }) as EventWithDetails
const day = (date: string, n: number, hiddenCount = 0): FeedDaySection => ({ date, data: Array.from({ length: n }, (_, i) => ev(`${date}-${i}`)), hiddenCount, revealed: false })

describe('desktopFeedMonths', () => {
  test('splits each month into its days, labelled, with today marked', () => {
    const months = desktopFeedMonths([day('2026-11-19', 4), day('2026-11-21', 7), day('2026-12-01', 1)], '2026-11-19')
    expect(months.map(m => m.label)).toEqual(['November 2026 · This month', 'December 2026'])
    expect(months[0].days.map(d => [d.label, d.isToday, d.data.length])).toEqual([['Thu, Nov 19', true, 4], ['Sat, Nov 21', false, 7]])
    expect(months[1].days[0].label).toBe('Tue, Dec 1')
  })

  test('keeps a day whose games are all hidden (its "N hidden · Show" row), drops an empty one', () => {
    const months = desktopFeedMonths([day('2026-11-20', 0, 2), day('2026-11-22', 0)], '2026-11-19')
    expect(months[0].days.map(d => d.date)).toEqual(['2026-11-20'])
  })
})

describe('collapseDay', () => {
  const items = [1, 2, 3, 4, 5, 6, 7]
  test('a quiet day shows everything, no button', () => {
    expect(collapseDay(items.slice(0, 4), 4, false, 'Thu, Nov 19')).toEqual({ shown: [1, 2, 3, 4], more: null })
  })
  test('a busy day shows the first few and offers the rest', () => {
    expect(collapseDay(items, 4, false, 'Sat, Nov 21')).toEqual({ shown: [1, 2, 3, 4], more: 'Show 3 more on Sat' })
    expect(collapseDay(items, 4, true, 'Sat, Nov 21')).toEqual({ shown: items, more: 'Show fewer' })
  })
})

describe('dayToScrollTo', () => {
  const days = ['2026-11-19', '2026-11-21', '2026-12-01']
  test('the picked day, else the next day with games', () => {
    expect(dayToScrollTo(days, '2026-11-21')).toBe('2026-11-21')
    expect(dayToScrollTo(days, '2026-11-22')).toBe('2026-12-01')
  })
  test('nothing loaded that late yet', () => {
    expect(dayToScrollTo(days, '2026-12-02')).toBeNull()
  })
})

test('labels', () => {
  expect(dayLabel('2026-03-08')).toBe('Sun, Mar 8') // a DST day stays the same date
  expect(gamesCount(1)).toBe('1 game')
  expect(gamesCount(3)).toBe('3 games')
})
