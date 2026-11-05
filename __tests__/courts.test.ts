import fixture from './fixtures/courts.json'
import {
  addDays, austinNow, bookedMinutes, clipFrom, courtLabel, coversDate, dayOptions, dowOf, facilityDays,
  formatAge, formatClock, formatFreeSummary, formatRange, freeWindows, gridSpan, gridTicks, isCourtsOld,
  openingMinutes, pickDay, splitCityPrice, toMin, unionRanges, venueCalendarUrl, zonedToIso,
} from '../utils/courts'
import type { CourtsData } from '../types'

const data = { ...(fixture as unknown as CourtsData), source: 'live' } as CourtsData

describe('Austin time', () => {
  it('reads today and the minute of the day in Austin, whatever the device zone', () => {
    // 2026-10-26 03:30 UTC is 22:30 on Oct 25 in Austin (CDT, UTC-5)
    expect(austinNow(new Date('2026-10-26T03:30:00Z'))).toEqual({ iso: '2026-10-25', minutes: 22 * 60 + 30 })
    // After the DST change (CST, UTC-6)
    expect(austinNow(new Date('2026-11-10T06:05:00Z'))).toEqual({ iso: '2026-11-10', minutes: 5 })
  })

  it('turns an Austin local time into an instant across DST', () => {
    expect(zonedToIso('2026-10-25', '20:30')).toBe('2026-10-26T01:30:00.000Z')
    expect(zonedToIso('2026-11-02', '19:00')).toBe('2026-11-03T01:00:00.000Z')
    expect(zonedToIso('2026-10-25', '24:00')).toBe('2026-10-26T05:00:00.000Z')
    expect(zonedToIso('bad', '20:30')).toBeNull()
    expect(zonedToIso('2026-10-25', '8pm')).toBeNull()
  })

  it('does date arithmetic on YYYY-MM-DD strings', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(dowOf('2026-10-25')).toBe(0)
    expect(toMin('07:30')).toBe(450)
    expect(toMin('24:00')).toBe(1440)
    expect(toMin('25:00')).toBeNaN()
  })
})

describe('day selection', () => {
  const days = dayOptions('2026-10-25', 7)

  it('lists seven days from today', () => {
    expect(days.map(d => d.iso)).toEqual([
      '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
    ])
    expect(days[0].isToday).toBe(true)
    expect(days[1].dow).toBe(1)
  })

  it('keeps a selected day that is still on the strip, else falls back to today', () => {
    expect(pickDay('2026-10-27', days)).toBe('2026-10-27')
    expect(pickDay('2026-10-24', days)).toBe('2026-10-25')
    expect(pickDay(null, days)).toBe('2026-10-25')
  })

  it('knows which dates the data covers', () => {
    expect(coversDate(data, '2026-10-31')).toBe(true)
    expect(coversDate(data, '2026-11-01')).toBe(false)
  })
})

describe('free windows', () => {
  it('finds the gaps between booked blocks inside opening hours', () => {
    const booked = bookedMinutes([['06:00', '07:00'], ['07:30', '12:30'], ['13:00', '18:00']])
    expect(freeWindows(booked, 360, 1440)).toEqual([[420, 450], [750, 780], [1080, 1440]])
  })

  it('treats an end at or before the start as running to midnight', () => {
    expect(bookedMinutes([['22:00', '00:00']])).toEqual([[1320, 1440]])
    expect(openingMinutes(['08:00', '00:00'])).toEqual([480, 1440])
    expect(openingMinutes(null)).toBeNull()
  })

  it('handles bookings outside hours and overlapping bookings', () => {
    expect(freeWindows([[300, 500], [450, 600]], 360, 720)).toEqual([[600, 720]])
    expect(freeWindows([[0, 1440]], 360, 1440)).toEqual([])
    expect(freeWindows([], 360, 600)).toEqual([[360, 600]])
  })

  it('unions courts and clips to now', () => {
    expect(unionRanges([[[420, 450], [1080, 1440]], [[440, 500]]])).toEqual([[420, 500], [1080, 1440]])
    expect(clipFrom([[420, 500], [1080, 1440]], 460)).toEqual([[460, 500], [1080, 1440]])
  })
})

describe('formatting', () => {
  it('formats times like the Schelagg site', () => {
    expect(formatClock(450)).toBe('7:30am')
    expect(formatClock(720)).toBe('12pm')
    expect(formatClock(1440)).toBe('12am')
    expect(formatRange([420, 450])).toBe('7–7:30am')
    expect(formatRange([690, 780])).toBe('11:30am–1pm')
    expect(formatRange([1080, 1440])).toBe('6pm–12am')
    expect(formatRange([540, 1440])).toBe('9am–12am')
    expect(formatRange([0, 120])).toBe('12–2am')
  })

  it('summarises free time in one line', () => {
    expect(formatFreeSummary([[420, 450], [750, 780], [1080, 1440]])).toBe('Free 7–7:30am, 12:30–1pm, 6pm–12am')
    expect(formatFreeSummary([[845, 1080]], 845)).toBe('Free now–6pm')
    expect(formatFreeSummary([])).toBe('Fully booked')
  })

  it('pulls a price out of the city text', () => {
    expect(splitCityPrice('Leander · $50/hr')).toEqual({ city: 'Leander', price: '$50/hr' })
    expect(splitCityPrice('Cedar Park')).toEqual({ city: 'Cedar Park', price: null })
    expect(splitCityPrice('N. Austin (Long Vista Dr)')).toEqual({ city: 'N. Austin (Long Vista Dr)', price: null })
  })

  it('shortens court names', () => {
    expect(courtLabel('HP Court 1')).toBe('Court 1')
    expect(courtLabel('CO Court 5')).toBe('Court 5')
    expect(courtLabel('Court #3')).toBe('Court 3')
    expect(courtLabel('HP Upper Field')).toBe('Upper Field')
  })

  it('describes how old the data is', () => {
    const now = Date.parse('2026-10-25T19:00:00Z')
    expect(isCourtsOld('2026-10-25T18:52:00Z', now)).toBe(false)
    expect(isCourtsOld('2026-10-25T17:00:00Z', now)).toBe(true)
    expect(isCourtsOld(undefined, now)).toBe(true)
    expect(formatAge(30_000)).toBe('just now')
    expect(formatAge(12 * 60_000)).toBe('12 min ago')
    expect(formatAge(3 * 3600_000)).toBe('3 h ago')
  })
})

describe('facilityDays', () => {
  const sunday = { iso: '2026-10-25', minutes: 13 * 60 + 50 }

  it('builds every facility for a day, with price, hours and free time', () => {
    const monday = facilityDays(data, '2026-10-26', sunday)
    expect(monday.map(d => d.key)).toEqual([
      'velocity:highpoint', 'velocity:highpoint-fields', 'velocity:crossover', 'treehouse:treehouse',
    ])
    const hp = monday[0]
    expect([hp.openMin, hp.closeMin]).toEqual([360, 1440])
    expect(hp.lanes[0]).toMatchObject({ label: 'Court 1', free: [[420, 450], [750, 780], [1080, 1440]] })
    expect(formatFreeSummary(hp.freeSummary)).toBe('Free 7–7:30am, 9am–12am')
    const fields = monday[1]
    expect(fields).toMatchObject({ city: 'Leander', price: '$50/hr' })
  })

  it('clips today to now and drops windows under 30 minutes', () => {
    const today = facilityDays(data, '2026-10-25', sunday)
    expect(today[0].freeSummary[0][0]).toBe(13 * 60 + 50)
    expect(today.every(d => d.freeSummary.every(([a, b]) => b - a >= 30))).toBe(true)
  })

  it('marks closed days and dates the data does not cover', () => {
    const saturday = facilityDays(data, '2026-10-31', sunday)
    expect(saturday.find(d => d.facility.id === 'treehouse')).toMatchObject({ open: false, freeSummary: [] })
    const beyond = facilityDays(data, '2026-11-01', sunday)
    expect(beyond.every(d => !d.covered && d.freeSummary.length === 0)).toBe(true)
  })

  it('filters by surface', () => {
    expect(facilityDays(data, '2026-10-26', sunday, 'grass').map(d => d.facility.id)).toEqual(['highpoint-fields'])
  })

  it('spans the grid from 6am (or earlier opening) to midnight', () => {
    expect(gridSpan(facilityDays(data, '2026-10-26', sunday))).toEqual([360, 1440])
    expect(gridTicks([360, 1440])).toEqual([360, 540, 720, 900, 1080, 1260, 1440])
  })
})

describe('venueCalendarUrl', () => {
  const skedda = { calendar: 'https://austinvelocity.skedda.com/booking', calendarDay: 'https://austinvelocity.skedda.com/booking?viewdate={date}' }

  it('opens the booking calendar on the chosen day', () => {
    expect(venueCalendarUrl(skedda, '2026-10-27')).toBe('https://austinvelocity.skedda.com/booking?viewdate=2026-10-27')
  })

  it('falls back to the plain calendar without a per-day link or a valid date', () => {
    expect(venueCalendarUrl({ calendar: skedda.calendar }, '2026-10-27')).toBe(skedda.calendar)
    expect(venueCalendarUrl(skedda, 'tomorrow')).toBe(skedda.calendar)
    expect(venueCalendarUrl({ ...skedda, calendarDay: 'https://austinvelocity.skedda.com/booking' }, '2026-10-27')).toBe(skedda.calendar)
  })

  it('never leaves the calendar host or https', () => {
    expect(venueCalendarUrl({ ...skedda, calendarDay: 'https://evil.example/?d={date}' }, '2026-10-27')).toBe(skedda.calendar)
    expect(venueCalendarUrl({ ...skedda, calendarDay: 'http://austinvelocity.skedda.com/booking?viewdate={date}' }, '2026-10-27')).toBe(skedda.calendar)
    expect(venueCalendarUrl({ ...skedda, calendarDay: 'javascript:alert({date})' }, '2026-10-27')).toBe(skedda.calendar)
  })

  it('is set for every venue in the court data fixture', () => {
    for (const v of (fixture as unknown as CourtsData).venues) {
      expect(venueCalendarUrl(v, '2026-10-27')).toBe(`${v.calendar}?viewdate=2026-10-27`)
    }
  })
})
