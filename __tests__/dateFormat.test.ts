import { __resetDateFormatCache, deviceTimeZone, formatDate, formatDateParts, formatDateTime, formatTime, formatWith } from '../utils/dateFormat'
import { DST_DAYS, localDate } from './helpers/clock'

// Every options object the app passes today (#342), plus the empty ones.
const OPTIONS: Intl.DateTimeFormatOptions[] = [
  {},
  { weekday: 'short' },
  { month: 'short' },
  { weekday: 'short', month: 'short', day: 'numeric' },
  { weekday: 'long', month: 'long', day: 'numeric' },
  { month: 'long', year: 'numeric' },
  { month: 'short', day: 'numeric' },
  { month: 'short', day: 'numeric', year: 'numeric' },
  { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' },
  { hour: 'numeric' },
  { hour: 'numeric', minute: '2-digit' },
  { hour: 'numeric', minute: '2-digit', hour12: true },
  { hour: '2-digit', minute: '2-digit' },
  { weekday: 'short', hour: 'numeric', minute: '2-digit' },
  { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true },
  { month: 'short', day: 'numeric', hour: 'numeric', timeZone: 'America/Chicago' },
  { month: 'short', day: 'numeric', timeZone: 'UTC' },
  { weekday: 'short', timeZone: 'America/Chicago' },
  { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' },
  { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' },
]

const INSTANTS = [
  localDate(2026, 11, 21, 19, 5),
  localDate(2026, 1, 1, 0, 0),
  localDate(2026, 12, 31, 23, 59),
  new Date(`${DST_DAYS.springForward}T08:30:00Z`),
  new Date(`${DST_DAYS.fallBack}T06:30:00Z`),
  Date.parse('2026-07-04T17:00:00Z'),
]

describe('utils/dateFormat (#342)', () => {
  beforeEach(() => __resetDateFormatCache())

  it.each(OPTIONS.map(o => [JSON.stringify(o), o]))('matches Date.prototype output for %s', (_label, options) => {
    for (const at of INSTANTS) {
      const d = new Date(at)
      expect(formatDate(d, options)).toBe(d.toLocaleDateString('en-US', options))
      expect(formatTime(d, options)).toBe(d.toLocaleTimeString('en-US', options))
      expect(formatDateTime(d, options)).toBe(d.toLocaleString('en-US', options))
      expect(formatDate(d, options, [])).toBe(d.toLocaleDateString([], options))
      expect(formatTime(d, options, [])).toBe(d.toLocaleTimeString([], options))
    }
  })

  it('matches the device-locale toLocaleString() with no arguments', () => {
    const d = INSTANTS[0] as Date
    expect(formatDateTime(d, {}, [])).toBe(d.toLocaleString())
  })

  it('formatWith and formatDateParts match a fresh Intl.DateTimeFormat', () => {
    const o: Intl.DateTimeFormatOptions = { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
    for (const at of INSTANTS) {
      expect(formatWith(at, o)).toBe(new Intl.DateTimeFormat('en-US', o).format(at))
      expect(formatWith(at, o, 'en-CA')).toBe(new Intl.DateTimeFormat('en-CA', o).format(at))
      expect(formatDateParts(at, o)).toEqual(new Intl.DateTimeFormat('en-US', o).formatToParts(at))
    }
  })

  it('reuses one formatter per locale and options', () => {
    const spy = jest.spyOn(Intl, 'DateTimeFormat')
    try {
      for (const at of INSTANTS) formatDate(at, { month: 'short', day: 'numeric' })
      expect(spy).toHaveBeenCalledTimes(1)
      formatDate(INSTANTS[0], { month: 'long', year: 'numeric' })
      expect(spy).toHaveBeenCalledTimes(2)
    } finally {
      spy.mockRestore()
    }
  })

  it('does not let a caller change a cached formatter by mutating its options', () => {
    const o: Intl.DateTimeFormatOptions = { month: 'short' }
    const first = formatDate(INSTANTS[0], o)
    o.month = 'long'
    expect(formatDate(INSTANTS[0], { month: 'short' })).toBe(first)
  })

  it('names the device time zone', () => {
    expect(deviceTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})
