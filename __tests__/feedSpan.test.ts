import { readFileSync } from 'fs'
import { join } from 'path'
import { isFeedRpcUnavailable, parseFeedSpan } from '../utils/feedSpan'
import { previewsFromRows } from '../utils/eventCardPreviews'
import { EXTERNAL_SESSION_SELECT, EVENT_LIST_EVENT_COLUMNS } from '../constants/events'

jest.mock('../lib/supabase', () => ({ supabase: {} }))

describe('parseFeedSpan', () => {
  it('accepts the RPC object and defaults missing extras to empty lists', () => {
    expect(parseFeedSpan({ events: [{ id: 'a' }] })).toEqual({ events: [{ id: 'a' }], tournaments: [], external: [], previews: [] })
  })

  it('rejects anything that is not the expected object', () => {
    for (const bad of [null, undefined, [], 'x', 1, {}, { events: null }]) expect(parseFeedSpan(bad)).toBeNull()
  })
})

describe('isFeedRpcUnavailable', () => {
  it('latches on "function missing or cannot run" errors', () => {
    for (const code of ['PGRST202', 'PGRST203', '42883', '42703', '42P01', '42501']) {
      expect(isFeedRpcUnavailable({ code })).toBe(true)
    }
  })

  it('does not latch on network, timeout or auth errors', () => {
    for (const error of [null, undefined, {}, { code: '' }, { code: '57014' }, { code: 'PGRST301' }]) {
      expect(isFeedRpcUnavailable(error)).toBe(false)
    }
  })
})

describe('previewsFromRows', () => {
  const row = (event_id: string, user_id: string) => ({ event_id, user_id, username: user_id, first_name: 'F', last_name: null, avatar_url: null }) as never

  it('groups rows per event in the attendee_previews shape', () => {
    const map = previewsFromRows([row('a', 'u1'), row('a', 'u2'), row('b', 'u3')])
    expect(map.get('a')).toEqual([
      { user_id: 'u1', profiles: { id: 'u1', username: 'u1', first_name: 'F', last_name: null, avatar_url: null } },
      { user_id: 'u2', profiles: { id: 'u2', username: 'u2', first_name: 'F', last_name: null, avatar_url: null } },
    ])
    expect(map.get('b')).toHaveLength(1)
  })

  it('gives every listed event an entry, empty when nobody is going', () => {
    const map = previewsFromRows([row('a', 'u1')], ['a', 'c'])
    expect(map.get('c')).toEqual([])
  })
})

/** The SQL builds the same keys the PostgREST selects ask for; pin them so the two can't drift. */
describe('get_feed_span migration matches the client selects', () => {
  const sql = readFileSync(join(__dirname, '..', 'supabase/migrations/20261025220000_get_feed_span.sql'), 'utf8')
  const keys = (list: string) => list.split(',').map(c => c.trim())
  const has = (k: string) => expect(sql).toContain(`'${k}', `)

  it('builds every event column and embed of EVENT_CARD_LIST_SELECT + my_attendance', () => {
    keys(EVENT_LIST_EVENT_COLUMNS).forEach(has)
    ;['profiles', 'event_attendees_attending', 'event_guests_attending', 'event_attendees_waitlisted', 'event_tags', 'clubs', 'my_attendance'].forEach(has)
  })

  it('builds every EXTERNAL_SESSION_SELECT column', () => {
    keys(EXTERNAL_SESSION_SELECT).forEach(has)
  })

  it('builds every TOURNAMENT_FEED_SELECT column', () => {
    const hook = readFileSync(join(__dirname, '..', 'hooks/feed/fallback.ts'), 'utf8')
    const select = /TOURNAMENT_FEED_SELECT =\s*'([^']+)'/.exec(hook)![1]
    keys(select.split(', profiles!')[0]).forEach(has)
  })

  it('runs as the caller, read-only, and is callable by guests', () => {
    expect(sql).toMatch(/security invoker/)
    expect(sql).toMatch(/\bstable\b/)
    expect(sql).toMatch(/set search_path = public/)
    expect(sql).toMatch(/grant execute on function public\.get_feed_span\(timestamptz, timestamptz, timestamptz\) to anon, authenticated/)
    expect(sql).not.toMatch(/\b(drop|update|delete|insert)\b/i)
  })
})
