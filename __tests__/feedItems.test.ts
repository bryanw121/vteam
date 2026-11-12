import { formatSessionTimeRange, isFeedItemOver, normalizeExternalSessions, normalizeTournaments, signupHost } from '../utils/feedItems'
import type { ExternalSession } from '../types'

const session: ExternalSession = {
  id: 'reclub-ABC',
  source_id: 'reclub',
  title: 'Koi C/B Coed Net',
  venue: 'Roots · Treehouse Gym',
  city: 'N. Austin',
  surface: 'indoor',
  session_type: 'Open play',
  level: 'C/B',
  price: '$12',
  starts_at: '2026-10-31T00:00:00.000Z',
  ends_at: '2026-10-31T03:00:00.000Z',
  signup_url: 'https://reclub.co/m/ABC',
  signup_label: 'Sign up on Reclub',
  note: null,
  region: 'austin',
  verified_at: '2026-10-24',
}

describe('normalizeExternalSessions', () => {
  it('maps a session into the feed shape without colliding with event ids', () => {
    const [item] = normalizeExternalSessions([session])
    expect(item.id).toBe('external:reclub-ABC')
    expect(item.event_date).toBe(session.starts_at)
    expect(item.duration_minutes).toBe(180)
    expect(item.location).toBe('Roots · Treehouse Gym · N. Austin')
    expect(item._external).toBe(session)
    expect(item.my_attendance).toEqual([])
  })

  it('tags open play so the Open Play filter includes it', () => {
    const [item] = normalizeExternalSessions([session])
    expect(item.event_tags?.[0].tags.name).toBe('Open Play')
    expect(item.event_tags?.[0].tags.category).toBe('event_type')
  })

  it('handles missing type and end time', () => {
    const [item] = normalizeExternalSessions([{ ...session, session_type: null, ends_at: null, city: null }])
    expect(item.event_tags).toEqual([])
    expect(item.duration_minutes).toBe(0)
    expect(item.location).toBe('Roots · Treehouse Gym')
  })

  it('returns [] for null', () => {
    expect(normalizeExternalSessions(null)).toEqual([])
  })
})

describe('normalizeTournaments', () => {
  it('flags tournaments and tags them', () => {
    const [t] = normalizeTournaments([{ id: 't1', title: 'Fall Cup', start_date: '2026-11-01T15:00:00Z', created_at: '' }])
    expect(t._isTournament).toBe(true)
    expect(t.event_date).toBe('2026-11-01T15:00:00Z')
    expect(t.event_tags?.[0].tags.name).toBe('Tournament')
  })
})

describe('formatSessionTimeRange', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 30, h, m).toISOString()
  it('drops the first meridiem when both ends share it', () => {
    expect(formatSessionTimeRange(at(19, 30), at(21))).toBe('7:30–9pm')
  })
  it('keeps both meridiems across noon', () => {
    expect(formatSessionTimeRange(at(11), at(13))).toBe('11am–1pm')
  })
  it('shows just the start without an end', () => {
    expect(formatSessionTimeRange(at(19), null)).toBe('7pm')
  })
})

describe('signupHost', () => {
  it('strips www and falls back on bad urls', () => {
    expect(signupHost('https://www.reclub.co/m/x')).toBe('reclub.co')
    expect(signupHost('not a url')).toBe('their site')
  })
})

describe('isFeedItemOver', () => {
  const now = Date.parse('2026-11-02T02:40:00Z') // 8:40pm CST, Nov 1
  it('drops an item once its end has passed', () => {
    // 1:00am CST Nov 1, one hour long: long over.
    expect(isFeedItemOver({ event_date: '2026-11-01T07:00:00', duration_minutes: 60 }, now)).toBe(true)
    // Ends exactly now: over.
    expect(isFeedItemOver({ event_date: '2026-11-02T01:40:00', duration_minutes: 60 }, now)).toBe(true)
  })
  it('keeps an item that is still running or hasn\'t started', () => {
    expect(isFeedItemOver({ event_date: '2026-11-02T01:00:00', duration_minutes: 120 }, now)).toBe(false) // 7–9pm
    expect(isFeedItemOver({ event_date: '2026-11-02T03:00:00+00:00', duration_minutes: 60 }, now)).toBe(false)
  })
  it('keeps items with no known end (tournaments, sessions without an end) for the rest of their day', () => {
    expect(isFeedItemOver({ event_date: '2026-11-01T15:00:00', duration_minutes: 0 }, now)).toBe(false)
  })
})
