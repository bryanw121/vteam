import {
  activeDayWeeks, activityLevel, chicagoDateKey, daysBetween, feedFilterLabel, formatDelta, formatSeconds, lastSeenLabel,
  mergeSmallCohorts, metricsRange, minutesSince, percentOf, platformShares, platformVersion, retentionLevel,
  outsideKindsLine, screenLabel, screenPath, shortDay, axisTicks, axisTop,
} from '../utils/metrics'
import type { RetentionCohort } from '../types'

// Instants are pinned (…Z) so the results don't depend on the zone the suite runs in.
const NOV_10_9PM_CHICAGO = new Date('2026-11-11T03:00:00Z')

describe('metricsRange', () => {
  it('ends on today in Chicago, not in UTC', () => {
    expect(chicagoDateKey(NOV_10_9PM_CHICAGO)).toBe('2026-11-10')
    expect(metricsRange(7, NOV_10_9PM_CHICAGO)).toEqual({ from: '2026-11-04', to: '2026-11-10' })
    expect(metricsRange(30, NOV_10_9PM_CHICAGO)).toEqual({ from: '2026-10-12', to: '2026-11-10' })
  })

  it('crosses the fall-back day without losing a day', () => {
    expect(metricsRange(7, new Date('2026-11-03T18:00:00Z'))).toEqual({ from: '2026-10-28', to: '2026-11-03' })
  })
})

describe('screen labels and paths', () => {
  it('names the screen types sessions report', () => {
    expect(screenLabel('/')).toBe('Events')
    expect(screenLabel('/event/[id]')).toBe('Event page')
    expect(screenLabel('/settings/notifications')).toBe('Settings')
    expect(screenLabel('/settings/metrics/[id]')).toBe('Admin metrics')
    expect(screenLabel('/scorekeeper/[id]/sheet')).toBe('Scorekeeper')
    expect(screenLabel('/something-new')).toBe('/something-new')
    expect(screenLabel(null)).toBe('Unknown')
  })

  it('drops consecutive repeats and caps the path', () => {
    expect(screenPath(['/', '/', '/event/[id]', '/chat', '/event/[id]'])).toBe('Events → Event page → Chat → Event page')
    expect(screenPath(['/', '/clubs', '/chat', '/profile', '/', '/clubs', '/chat'], 3)).toBe('Events → Clubs → Chat → …')
    expect(screenPath([])).toBe('')
  })
})

describe('formatting', () => {
  it('formats session lengths', () => {
    expect(formatSeconds(45)).toBe('45s')
    expect(formatSeconds(400)).toBe('6m 40s')
    expect(formatSeconds(600)).toBe('10m')
    expect(formatSeconds(3900)).toBe('1h 5m')
    expect(formatSeconds(null)).toBe('–')
  })

  it('says how long ago a session started', () => {
    expect(minutesSince('2026-11-11T02:36:00Z', NOV_10_9PM_CHICAGO)).toBe('24 min')
    expect(minutesSince('2026-11-11T02:59:50Z', NOV_10_9PM_CHICAGO)).toBe('1 min')
    expect(minutesSince('2026-11-11T01:00:00Z', NOV_10_9PM_CHICAGO)).toBe('2h')
  })

  it('states a change against the prior period', () => {
    expect(formatDelta(13.4, 11.3, 'prior 30 days')).toBe('+2.1 vs prior 30 days')
    expect(formatDelta(20, 25, 'last week')).toBe('−5 vs last week')
    expect(formatDelta(4, 4, 'last week')).toBe('Same as last week')
    expect(formatDelta(null, 4, 'last week')).toBeNull()
  })

  it('computes percents and platform shares', () => {
    expect(percentOf(13, 31)).toBe(42)
    expect(percentOf(1, 0)).toBeNull()
    expect(platformShares({ web: 7, ios: 13, android: 0 })).toEqual([
      { platform: 'ios', label: 'iOS', people: 13, percent: 65 },
      { platform: 'web', label: 'Web', people: 7, percent: 35 },
    ])
    expect(platformVersion('ios', '1.6.0')).toBe('iOS 1.6.0')
    expect(platformVersion('web', '1.6.0')).toBe('Web')
    expect(platformVersion(null, null)).toBe('No sessions yet')
  })

  it('labels last seen in Chicago days', () => {
    expect(lastSeenLabel('2026-11-11T02:00:00Z', true, NOV_10_9PM_CHICAGO)).toBe('Online now')
    expect(lastSeenLabel('2026-11-11T02:55:00Z', false, NOV_10_9PM_CHICAGO)).toBe('5 min ago')
    expect(lastSeenLabel('2026-11-10T19:00:00Z', false, NOV_10_9PM_CHICAGO)).toBe('8 h ago')
    // 11 PM Nov 9 in Chicago is already Nov 10 in UTC: still "Yesterday".
    expect(lastSeenLabel('2026-11-10T05:00:00Z', false, NOV_10_9PM_CHICAGO)).toBe('Yesterday')
    expect(lastSeenLabel('2026-11-07T18:00:00Z', false, NOV_10_9PM_CHICAGO)).toBe('3 days ago')
    expect(lastSeenLabel('2026-10-20T18:00:00Z', false, NOV_10_9PM_CHICAGO)).toBe('Oct 20')
    expect(lastSeenLabel(null, false, NOV_10_9PM_CHICAGO)).toBe('Never opened the app')
  })

  it('counts calendar days between two instants', () => {
    expect(daysBetween('2026-09-12T15:00:00Z', '2026-09-14T15:00:00Z')).toBe(2)
    expect(daysBetween(null, '2026-09-14T15:00:00Z')).toBe(0)
    expect(shortDay('2026-11-07')).toBe('Nov 7')
  })
})

describe('retention', () => {
  const cohort = (week: string, size: number, w1: number | null, w2: number | null = null): RetentionCohort =>
    ({ week, size, w1, w2, w4: null, w8: null })

  it('merges weeks with fewer than 3 sign-ups into the next week', () => {
    const merged = mergeSmallCohorts([
      cohort('2026-09-14', 6, 5, 4),
      cohort('2026-09-21', 1, 1, 0),
      cohort('2026-09-28', 2, 1, 1),
      cohort('2026-10-05', 4, 3, null),
    ])
    expect(merged).toEqual([
      cohort('2026-09-14', 6, 5, 4),
      cohort('2026-09-21', 3, 2, 1),
      cohort('2026-10-05', 4, 3, null),
    ])
  })

  it('folds a small last week into the one before, and keeps a lone small week', () => {
    expect(mergeSmallCohorts([cohort('2026-10-26', 4, 2), cohort('2026-11-02', 1, null)]))
      .toEqual([cohort('2026-10-26', 5, null)])
    expect(mergeSmallCohorts([cohort('2026-11-02', 2, null)])).toEqual([cohort('2026-11-02', 2, null)])
  })

  it('shades cells by share', () => {
    expect(retentionLevel(null)).toBe(0)
    expect(retentionLevel(25)).toBe(1)
    expect(retentionLevel(50)).toBe(2)
    expect(retentionLevel(83)).toBe(3)
  })
})

describe('active days grid', () => {
  it('starts each row on a Monday and pads the last week', () => {
    // 2026-10-07 is a Wednesday.
    const days = Array.from({ length: 35 }, (_, i) => ({ day: new Date(Date.UTC(2026, 9, 7 + i)).toISOString().slice(0, 10), minutes: i }))
    const weeks = activeDayWeeks(days)
    expect(weeks[0].slice(0, 2)).toEqual([null, null])
    expect(weeks[0][2]?.day).toBe('2026-10-07')
    expect(weeks.every(w => w.length === 7)).toBe(true)
    expect(weeks.flat().filter(Boolean)).toHaveLength(35)
    expect(activeDayWeeks([])).toEqual([])
  })

  it('shades by minutes', () => {
    expect([0, 5, 20, 45].map(activityLevel)).toEqual([0, 1, 2, 3])
  })
})

describe('part 3 labels', () => {
  it('names feed filter pairs', () => {
    expect(feedFilterLabel('tournament', 'sand')).toBe('Tournament · sand')
    expect(feedFilterLabel('all', 'all')).toBe('All · any surface')
    expect(feedFilterLabel('new_chip', 'indoor')).toBe('new_chip · indoor')
  })

  it('summarizes outside link-outs by kind, largest first, singular when one', () => {
    expect(outsideKindsLine({ league: 4, session: 12, court: 1, tournament: 0 })).toBe('12 sessions · 4 leagues · 1 court booking')
    expect(outsideKindsLine({})).toBe('')
  })
})

describe('axisTop / axisTicks', () => {
  it('starts at 0 and ends on a whole number at or above the largest value', () => {
    expect(axisTicks(0)).toEqual([0, 1])
    expect(axisTicks(1)).toEqual([0, 1])
    expect(axisTicks(2)).toEqual([0, 1, 2])
    expect(axisTicks(3)).toEqual([0, 2, 4])
    expect(axisTicks(7)).toEqual([0, 4, 8])
    expect(axisTicks(10)).toEqual([0, 5, 10])
  })
  it('rounds fractions up and ignores bad input', () => {
    expect(axisTop(2.2)).toBe(4)
    expect(axisTop(-5)).toBe(1)
    expect(axisTop(Number.NaN)).toBe(1)
  })
  it('every tick is a whole number', () => {
    for (let max = 0; max <= 60; max++) for (const t of axisTicks(max)) expect(Number.isInteger(t)).toBe(true)
  })
})
