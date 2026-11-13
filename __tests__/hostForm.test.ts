/** #188 part 1: the host form's pure core, without the screen. */
import { emptyForm, eventColumns, formWithTemplate, recentVenuesFrom, eventDates, formFromEvent, formFromParams, hostFormProblem, roundToNearest5 } from '../utils/hostForm'
import { localDate } from './helpers/clock'
import type { CreateEventForm, EventEditSource, HostRecurrence } from '../types'

const NOW = localDate(2026, 11, 13, 18, 2)
const base = emptyForm(NOW)
const single: HostRecurrence = { enabled: false, days: [], cadence: 'weekly', endDate: localDate(2026, 12, 31) }
const form = (f: Partial<CreateEventForm> = {}): CreateEventForm => ({ ...base, title: 'Tuesday 6s', ...f })

describe('roundToNearest5 / emptyForm', () => {
  it('starts a new game at the next 5 minutes', () => {
    expect(roundToNearest5(NOW)).toEqual(localDate(2026, 11, 13, 18, 5))
    expect(roundToNearest5(localDate(2026, 11, 13, 18, 55))).toEqual(localDate(2026, 11, 13, 18, 55))
    expect(base).toMatchObject({ title: '', maxAttendees: null, priceText: '', surface: null, requiresApproval: false })
  })
})

describe('formFromParams', () => {
  it('takes Book a court’s venue, surface and cap', () => {
    const f = formFromParams(base, { location: 'Zilker Park', surface: 'sand', maxAttendees: '12' }, NOW.getTime())
    expect(f).toMatchObject({ location: 'Zilker Park', surface: 'sand', maxAttendees: 12 })
  })

  it('ignores a bad cap, an unknown surface and a past date', () => {
    const f = formFromParams(base, { maxAttendees: '0', surface: 'ice', date: '2020-01-01T00:00:00Z' }, NOW.getTime())
    expect(f).toMatchObject({ maxAttendees: null, surface: null, date: base.date })
  })

  it('takes a club poll’s winning time and question, trimmed and capped', () => {
    const when = new Date(NOW.getTime() + 86_400_000).toISOString()
    const f = formFromParams(base, { date: when, title: `  ${'x'.repeat(120)} ` }, NOW.getTime())
    expect(f.date.toISOString()).toBe(when)
    expect(f.title).toHaveLength(100)
    expect(formFromParams(base, { location: 'y'.repeat(250) }, NOW.getTime()).location).toHaveLength(200)
  })
})

describe('formFromEvent', () => {
  it('maps an event row for editing', () => {
    const row = {
      title: 'Sand 4s', description: null, location: 'Zilker', latitude: 30.26, longitude: -97.77,
      event_date: '2026-11-20T00:00:00.000Z', duration_minutes: null, max_attendees: 8, price: 5.5,
      venmo_handle: 'ana', requires_approval: null, surface: 'sand',
    } as unknown as EventEditSource
    expect(formFromEvent(row)).toMatchObject({
      description: '', locationLatitude: 30.26, durationMinutes: base.durationMinutes, priceText: '5.50',
      venmoHandle: 'ana', requiresApproval: false, surface: 'sand',
    })
  })
})

describe('eventDates / hostFormProblem', () => {
  it('is one game unless Repeat is on', () => {
    expect(eventDates(form(), single)).toHaveLength(1)
    const weekly = { ...single, enabled: true, days: [form().date.getDay()], endDate: localDate(2026, 12, 4) }
    expect(eventDates(form(), weekly).length).toBeGreaterThan(1)
  })

  it('names what stops a save', () => {
    expect(hostFormProblem(form({ title: '  ' }), single)).toBe('Add a title.')
    const none = { ...single, enabled: true, days: [], endDate: localDate(2026, 11, 1) }
    expect(hostFormProblem(form(), none)).toMatch(/no valid dates/)
    expect(hostFormProblem(form(), single)).toBeNull()
  })
})

describe('eventColumns', () => {
  it('keeps Venmo only for a paid game, and empty text as null', () => {
    expect(eventColumns(form({ priceText: '5.5', venmoHandle: ' ana ' }), 'c1')).toMatchObject({ price: 5.5, venmo_handle: 'ana', club_id: 'c1', description: null, location: null })
    expect(eventColumns(form({ priceText: '', venmoHandle: 'ana' }), null)).toMatchObject({ price: null, venmo_handle: null })
    expect(eventColumns(form({ priceText: '0', venmoHandle: 'ana' }), null).venmo_handle).toBeNull()
  })

  it('writes an unlimited cap as null and the coordinates as given', () => {
    const cols = eventColumns(form({ maxAttendees: null, locationLatitude: 1, locationLongitude: 2 }), null)
    expect(cols).toMatchObject({ max_attendees: null, latitude: 1, longitude: 2 })
  })

})

describe('recentVenuesFrom / formWithTemplate', () => {
  it('keeps the first five distinct venues, newest first', () => {
    const row = (location: string | null, latitude: number | null = null) => ({ location, latitude, longitude: null })
    const rows = [row('Zilker', 1), row(null), row('Zilker', 2), row('A'), row('B'), row('C'), row('D'), row('E')]
    expect(recentVenuesFrom(rows).map(v => v.display)).toEqual(['Zilker', 'A', 'B', 'C', 'D'])
    expect(recentVenuesFrom(rows)[0].latitude).toBe(1)
  })

  it('applies a template and clears coordinates it does not have', () => {
    const f = formWithTemplate(form({ locationLatitude: 1, locationLongitude: 2, priceText: '5' }), { title: 'Sand 4s', description: null, location: 'Zilker', max_attendees: 8 })
    expect(f).toMatchObject({ title: 'Sand 4s', description: '', location: 'Zilker', maxAttendees: 8, locationLatitude: null, priceText: '5' })
  })
})
