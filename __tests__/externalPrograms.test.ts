import type { ExternalProgram } from '../types'
import {
  daysUntil, isCurrent, programDeadline, programDivisions, programKicker, programPrice,
  programsForRegion, programUrgency, programWhen, weekdayDay,
} from '../utils/externalPrograms'
import { normalizeProgramTournaments } from '../utils/feedItems'
import { hideOptions, hiddenIndex, isHidden } from '../utils/hiddenFeed'
import { eventLocalDateKey, surfaceOf } from '../utils'

const TODAY = '2026-11-08'

const prog = (id: string, extra: Partial<ExternalProgram> = {}): ExternalProgram => ({
  id, kind: 'league', surface: 'indoor', region: 'austin', state: 'TX', series: null, org: 'ACES', title: id,
  venue: 'Example Gym', city: 'Austin', address: null, format: null, divisions: [], starts_on: '2026-11-22',
  ends_on: '2027-01-31', weekdays: ['Sunday'], registration_opens: null, registration_deadline: '2026-11-13',
  waitlist_on: null, team_price: '$689', individual_price: '$99', price_note: null, price_changes_on: null,
  status: 'open', signup_url: 'https://example.test/x', source_url: 'https://example.test/x', checked_at: '2026-11-08T13:00:00Z',
  ...extra,
})

describe('outside leagues and tournaments', () => {
  it('groups a region: tournaments by start, leagues by deadline, NAGVA elsewhere in the same state', () => {
    const rows = [
      prog('late league', { registration_deadline: '2026-12-14' }),
      prog('soon league', { registration_deadline: '2026-11-10' }),
      prog('past league', { registration_deadline: '2026-11-01' }),
      prog('cup', { kind: 'tournament', starts_on: '2026-12-05', ends_on: '2026-12-05' }),
      prog('early cup', { kind: 'tournament', starts_on: '2026-11-28', ends_on: '2026-11-28' }),
      prog('alamo', { kind: 'tournament', series: 'nagva', org: 'NAGVA', region: null, city: 'San Antonio', starts_on: '2026-12-18', ends_on: '2026-12-19', registration_deadline: null }),
      prog('dallas league', { region: 'dallas' }),
      prog('ohio nagva', { kind: 'tournament', series: 'nagva', region: null, state: 'OH' }),
    ]
    const g = programsForRegion(rows, 'austin', TODAY)
    expect(g.leagues.map(p => p.id)).toEqual(['soon league', 'late league'])
    expect(g.tournaments.map(p => p.id)).toEqual(['early cup', 'cup'])
    expect(g.nagvaElsewhere.map(p => p.id)).toEqual(['alamo'])
    expect(programsForRegion([], 'austin', TODAY).nagvaElsewhere).toEqual([])
  })

  it('isCurrent drops ended programs and closed deadlines', () => {
    expect(isCurrent(prog('a'), TODAY)).toBe(true)
    expect(isCurrent(prog('a', { registration_deadline: '2026-11-07' }), TODAY)).toBe(false)
    expect(isCurrent(prog('a', { ends_on: '2026-11-07', registration_deadline: null }), TODAY)).toBe(false)
  })

  it('says what is urgent, in order: a price step, then the deadline', () => {
    expect(programUrgency(prog('a', { registration_deadline: TODAY }), TODAY)).toBe('Last day to sign up')
    expect(programUrgency(prog('a', { registration_deadline: '2026-11-09' }), TODAY)).toBe('1 day left')
    expect(programUrgency(prog('a'), TODAY)).toBe('5 days left')
    expect(programUrgency(prog('a', { registration_deadline: '2026-12-01' }), TODAY)).toBeNull()
    expect(programUrgency(prog('a', { price_note: 'Early bird', price_changes_on: TODAY }), TODAY)).toBe('Early bird ends today')
    expect(programUrgency(prog('a', { price_changes_on: '2026-11-09', registration_deadline: null }), TODAY)).toBe('Price goes up after tomorrow')
    expect(programUrgency(prog('a', { status: 'full' }), TODAY)).toBeNull()
  })

  it('writes the dates, price, deadline and kicker', () => {
    expect(daysUntil('2026-11-13', TODAY)).toBe(5)
    expect(weekdayDay('2026-12-05')).toBe('Sat, Dec 5')
    expect(programWhen(prog('a'))).toBe('Sundays · Nov 22 – Jan 31')
    expect(programWhen(prog('a', { kind: 'tournament', starts_on: '2026-12-18', ends_on: '2026-12-19' }))).toBe('Fri, Dec 18 – Sat, Dec 19')
    expect(programPrice(prog('a'))).toBe('$689 team · $99 free agent')
    expect(programPrice(prog('a', { team_price: null, individual_price: '$45' }))).toBe('$45 per player')
    expect(programPrice(prog('a', { team_price: null, individual_price: null }))).toBeNull()
    expect(programDeadline(prog('a'), TODAY)).toBe('Sign up by Fri, Nov 13')
    expect(programDeadline(prog('a', { status: 'closed', registration_opens: '2026-12-01' }), TODAY)).toBe('Opens Dec 1')
    expect(programKicker(prog('a', { kind: 'tournament', surface: 'sand' }))).toBe('Tournament · Sand · ACES')
    expect(programDivisions(prog('a', { divisions: [{ name: 'A1', cap: 12, confirmed: 7 }, { name: 'B' }] }))).toBe('A1 (7 of 12 confirmed), B')
  })

  it('puts outside tournaments in the feed on their first day, as Tournament, with their surface', () => {
    const [item, ...rest] = normalizeProgramTournaments([prog('cup', { kind: 'tournament', starts_on: '2026-12-05', surface: 'sand' }), prog('league')])
    expect(rest).toHaveLength(0)
    expect(item.id).toBe('program:cup')
    expect(eventLocalDateKey(item.event_date)).toBe('2026-12-05')
    expect(item.event_tags.map(t => t.tags.name)).toEqual(['Tournament'])
    expect(surfaceOf(item)).toBe('sand')
    expect(item._program?.id).toBe('cup')
    // Hide menu: the tournament, or everything from its organizer.
    const options = hideOptions(item, 'me')
    expect(options[0].title).toBe('Hide this tournament')
    expect(options[1].title).toBe('Hide everything from ACES')
    expect(isHidden(item, hiddenIndex([options[1].entry]))).toBe(true)
  })
})

describe('hosts', () => {
  const { programHosts, byHost } = jest.requireActual('../utils/externalPrograms')
  const rows = [
    { id: 'a', org: 'ACES' }, { id: 'b', org: 'NAGVA' }, { id: 'c', org: 'ACES' }, { id: 'd', org: 'Austin Sports & Social Club' },
  ]
  it('lists hosts most first, then by name, and filters by one', () => {
    expect(programHosts(rows)).toEqual([{ org: 'ACES', count: 2 }, { org: 'Austin Sports & Social Club', count: 1 }, { org: 'NAGVA', count: 1 }])
    expect(byHost(rows, 'ACES').map((p: { id: string }) => p.id)).toEqual(['a', 'c'])
    expect(byHost(rows, null)).toHaveLength(4)
    expect(byHost(rows, 'Gone')).toHaveLength(4) // a host no longer listed shows everything
  })
})
