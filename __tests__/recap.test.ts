import { buildRecapMeta, pointsForEvent, pointsLine, recapEligible, recapImagePath, recapName, yearStartIso } from '../utils/recap'
import { fetchRecap } from '../api/_lib/recap'
import { routes } from '../utils/routes'

const CFG = { url: 'https://x.supabase.co', anonKey: 'anon' }
const EVENT = 'e0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

describe('recap rules', () => {
  it('points match award_event_points: 5 for Tournament, otherwise 2', () => {
    expect(pointsForEvent(['Open Play'])).toBe(2)
    expect(pointsForEvent(['tournament'])).toBe(5)
    expect(pointsForEvent([])).toBe(2)
  })
  it('only attending, non-no-show players get a recap', () => {
    expect(recapEligible({ status: 'attending', no_show: false })).toBe(true)
    expect(recapEligible({ status: 'attending', no_show: true })).toBe(false)
    expect(recapEligible({ status: 'waitlisted' })).toBe(false)
    expect(recapEligible(null)).toBe(false)
  })
  it('names a player "First L." and never more', () => {
    expect(recapName({ first_name: 'Maya', last_name: 'kim' })).toBe('Maya K.')
    expect(recapName({ first_name: 'Maya' })).toBe('Maya')
    expect(recapName({ username: 'mk' })).toBe('mk')
    expect(recapName(null)).toBe('A player')
  })
  it('says when points are still pending', () => {
    const end = Date.parse('2026-11-10T03:00:00Z')
    expect(pointsLine(2, end, false, end + 60_000)).toMatch(/after the host's 2-hour window/)
    expect(pointsLine(2, end, false, end + 3 * 3_600_000)).toBe('+2 points')
    expect(pointsLine(5, end, true, end)).toBe('+5 points')
  })
  it('builds the picture copy from the player\'s own numbers', () => {
    const meta = buildRecapMeta({
      profile: { first_name: 'Maya', last_name: 'Kim' },
      event: { title: 'Sand Doubles at Butler', event_date: '2026-11-10T00:00:00Z', location: 'Butler Park' },
      tagNames: ['Open Play'], cheers: 3, gamesThisYear: 0,
    })
    expect(meta).toEqual({ name: 'Maya K.', title: 'Sand Doubles at Butler', date: 'Mon, Nov 9', place: 'Butler Park', points: 2, cheers: 3, gamesThisYear: 1 })
  })
  it('links', () => {
    expect(recapImagePath(EVENT, USER, '3')).toBe(`/api/og/recap?event=${EVENT}&user=${USER}&v=3`)
    expect(routes.event(EVENT, { r: true })).toBe(`/event/${EVENT}?r=1`)
    expect(yearStartIso('2026-11-10T00:00:00Z')).toBe('2026-01-01T00:00:00Z')
  })
})

describe('fetchRecap', () => {
  function fake(over: { attendee?: unknown[]; eventDate?: string } = {}) {
    return async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': url.includes('cheers') ? '*/4' : '*/7' } })
      if (url.includes('/events?')) return new Response(JSON.stringify([{ title: 'Thursday 6s', event_date: over.eventDate ?? '2026-11-10T01:00:00', location: 'Dittmar', duration_minutes: 120, event_tags: [{ tags: { name: 'Tournament' } }] }]), { status: 200 })
      if (url.includes('/event_attendees?')) return new Response(JSON.stringify(over.attendee ?? [{ status: 'attending', no_show: false }]), { status: 200 })
      if (url.includes('/profiles?')) return new Response(JSON.stringify([{ first_name: 'Ana', last_name: 'Lopez', username: 'ana' }]), { status: 200 })
      return new Response('[]', { status: 200 })
    }
  }
  const after = Date.parse('2026-11-12T00:00:00Z')
  it('returns the player\'s numbers for a finished game they played', async () => {
    const meta = await fetchRecap(EVENT, USER, CFG, after, fake())
    expect(meta).toMatchObject({ name: 'Ana L.', title: 'Thursday 6s', points: 5, cheers: 4, gamesThisYear: 7 })
  })
  it('is null for someone not attending, a no-show, or a game not over yet', async () => {
    expect(await fetchRecap(EVENT, USER, CFG, after, fake({ attendee: [] }))).toBeNull()
    expect(await fetchRecap(EVENT, USER, CFG, after, fake({ attendee: [{ status: 'attending', no_show: true }] }))).toBeNull()
    expect(await fetchRecap(EVENT, USER, CFG, Date.parse('2026-11-10T02:00:00Z'), fake())).toBeNull()
  })
})
