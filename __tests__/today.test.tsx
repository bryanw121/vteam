import { readFileSync } from 'fs'
import { join } from 'path'
import { AppState } from 'react-native'
import { act, renderHook } from '@testing-library/react-native'
import { msUntilNextLocalMidnight, useToday } from '../hooks/useToday'
import { dayLabel } from '../utils'
import { EVENT_TIME_ZONE } from '../constants/time'
import { SHARE_TIME_ZONE } from '../constants/share'
import { REMINDER_TIME_ZONE } from '../constants/notifications'
import { AUSTIN_TZ } from '../utils/courts'
import { DST_DAYS, localDate, nextLocalMidnight, travelTo } from './helpers/clock'

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('useToday', () => {
  it('rolls over at local midnight', () => {
    travelTo(localDate(2026, 11, 12, 23, 58))
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-11-12')
    act(() => { jest.advanceTimersByTime(2 * 60_000 + 1_000) })
    expect(result.current).toBe('2026-11-13')
  })

  it('catches up when the app comes back to the foreground on a new day', () => {
    const listeners: Array<(s: string) => void> = []
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
      listeners.push(fn)
      return { remove: () => {} }
    }) as typeof AppState.addEventListener)
    travelTo(localDate(2026, 11, 12, 22, 0))
    const { result } = renderHook(() => useToday())
    // The phone slept: the clock jumps to the next morning without timers firing.
    jest.setSystemTime(localDate(2026, 11, 13, 7, 30))
    act(() => { listeners.forEach(fn => fn('active')) })
    expect(result.current).toBe('2026-11-13')
  })
})

describe('msUntilNextLocalMidnight', () => {
  it('is the time left in the local day', () => {
    expect(msUntilNextLocalMidnight(localDate(2026, 11, 12, 23, 0))).toBe(60 * 60_000 + 1_000)
  })

  it('follows the local calendar on the fall-back day', () => {
    const [y, m, d] = DST_DAYS.fallBack.split('-').map(Number)
    const morning = localDate(y, m, d, 8, 0)
    const fired = new Date(morning.getTime() + msUntilNextLocalMidnight(morning))
    expect(fired.getDate()).toBe(nextLocalMidnight(morning).getDate())
    expect(fired.getHours()).toBe(0)
  })
})

describe('dayLabel', () => {
  it('names today and tomorrow relative to the given day, not the clock at load', () => {
    expect(dayLabel('2026-11-13', '2026-11-13')).toBe('Today')
    expect(dayLabel('2026-11-14', '2026-11-13')).toBe('Tomorrow')
    expect(dayLabel('2026-11-15', '2026-11-13')).toBe('Sun, Nov 15')
  })

  it('crosses month ends and the fall-back day', () => {
    expect(dayLabel('2026-12-01', '2026-11-30')).toBe('Tomorrow')
    expect(dayLabel('2026-11-02', DST_DAYS.fallBack)).toBe('Tomorrow')
    expect(dayLabel('2026-03-09', DST_DAYS.springForward)).toBe('Tomorrow')
  })
})

describe('EVENT_TIME_ZONE', () => {
  it('is the one zone behind every alias', () => {
    expect(SHARE_TIME_ZONE).toBe(EVENT_TIME_ZONE)
    expect(REMINDER_TIME_ZONE).toBe(EVENT_TIME_ZONE)
    expect(AUSTIN_TZ).toBe(EVENT_TIME_ZONE)
  })

  it('matches the copies in e2e and the shots harness (they cannot import app code)', () => {
    const root = join(__dirname, '..')
    const e2e = readFileSync(join(root, 'e2e/schelaggMock.ts'), 'utf8')
    const shots = readFileSync(join(root, 'scripts/shots/fixtures/time.mjs'), 'utf8')
    expect(e2e).toContain(`export const AUSTIN_TZ = '${EVENT_TIME_ZONE}'`)
    expect(shots).toContain(`export const TIME_ZONE = '${EVENT_TIME_ZONE}'`)
  })
})
