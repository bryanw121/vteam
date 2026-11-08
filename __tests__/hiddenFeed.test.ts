import type { EventWithDetails, ExternalSession, HiddenFeedEntry } from '../types'
import { normalizeExternalSessions } from '../utils/feedItems'
import {
  HIDDEN_FEED_MAX,
  hiddenIndex,
  hideOptions,
  isHidden,
  matchingEntries,
  parseHiddenFeed,
  pruneHidden,
  withHidden,
  withoutHidden,
} from '../utils/hiddenFeed'

const tag = (name: string, category = 'event_type') => ({
  tag_id: name,
  tags: { id: name, name, category, display_order: 1, created_at: '' },
})

function vteamEvent(over: Partial<EventWithDetails> = {}): EventWithDetails {
  return {
    id: 'ev-1',
    title: 'Friday Sixes',
    created_by: 'host-1',
    event_date: '2026-11-13T00:00:00Z',
    surface: 'indoor',
    profiles: { first_name: 'Dana', last_name: 'Lee', username: 'dana' },
    event_tags: [tag('Open Play'), tag('Intermediate', 'skill_level')],
    ...over,
  } as unknown as EventWithDetails
}

function outsideSession(over: Partial<ExternalSession> = {}): EventWithDetails {
  return normalizeExternalSessions([{
    id: 's1', source_id: 'x', title: 'Reverse Coed 4s', venue: 'Volleyworld ', city: 'Austin', region: 'austin',
    starts_at: '2026-11-14T01:00:00Z', ends_at: null, surface: 'sand', session_type: 'Open Play',
    level: null, note: null, price: null, signup_label: null, signup_url: null, canceled: false,
    updated_at: '', verified_at: null,
    ...over,
  } as ExternalSession])[0]
}

describe('hideOptions', () => {
  it('offers the event, its host, its type tags and its surface (not skill level)', () => {
    expect(hideOptions(vteamEvent(), 'me').map(o => o.title)).toEqual([
      'Hide this event',
      'Hide events from Dana Lee',
      'Hide all Open Play',
      'Hide all indoor games',
    ])
  })

  it('never offers to hide your own events by host', () => {
    expect(hideOptions(vteamEvent(), 'host-1').some(o => o.entry.kind === 'host')).toBe(false)
  })

  it('offers the venue for an outside session', () => {
    const opts = hideOptions(outsideSession(), 'me')
    expect(opts[0]).toMatchObject({ title: 'Hide this session', entry: { kind: 'item', key: 'external:s1' } })
    expect(opts[1]).toMatchObject({ title: 'Hide everything at Volleyworld', entry: { kind: 'venue', key: 'volleyworld', label: 'Volleyworld' } })
  })
})

describe('isHidden', () => {
  const hide = (...entries: HiddenFeedEntry[]) => hiddenIndex(entries)

  it('matches by item, host, type tag and surface', () => {
    const ev = vteamEvent()
    expect(isHidden(ev, hide())).toBe(false)
    expect(isHidden(ev, hide({ kind: 'item', key: 'ev-1', label: '' }))).toBe(true)
    expect(isHidden(ev, hide({ kind: 'host', key: 'host-1', label: '' }))).toBe(true)
    expect(isHidden(ev, hide({ kind: 'type', key: 'tag:open play', label: '' }))).toBe(true)
    expect(isHidden(ev, hide({ kind: 'type', key: 'surface:indoor', label: '' }))).toBe(true)
    expect(isHidden(ev, hide({ kind: 'type', key: 'surface:sand', label: '' }))).toBe(false)
    expect(isHidden(ev, hide({ kind: 'type', key: 'tag:intermediate', label: '' }))).toBe(false)
  })

  it('lists every entry that hides an item', () => {
    const entries: HiddenFeedEntry[] = [
      { kind: 'type', key: 'surface:indoor', label: 'Indoor games' },
      { kind: 'venue', key: 'aces', label: 'ACES' },
      { kind: 'host', key: 'host-1', label: 'Dana' },
    ]
    expect(matchingEntries(vteamEvent(), entries).map(e => e.key)).toEqual(['surface:indoor', 'host-1'])
  })

  it('matches outside sessions by venue regardless of case and spacing', () => {
    expect(isHidden(outsideSession({ venue: 'VOLLEYWORLD' }), hide({ kind: 'venue', key: 'volleyworld', label: '' }))).toBe(true)
    expect(isHidden(outsideSession({ venue: 'ACES' }), hide({ kind: 'venue', key: 'volleyworld', label: '' }))).toBe(false)
  })
})

describe('the hidden list', () => {
  const now = Date.parse('2026-11-07T12:00:00Z')
  const item = (key: string, until: string): HiddenFeedEntry => ({ kind: 'item', key, label: key, until })

  it('adds newest first without duplicates', () => {
    const a: HiddenFeedEntry = { kind: 'venue', key: 'aces', label: 'ACES' }
    const b: HiddenFeedEntry = { kind: 'type', key: 'surface:sand', label: 'Sand games' }
    expect(withHidden(withHidden([a], b, now), a, now)).toEqual([a, b])
  })

  it('drops items more than a day past their date', () => {
    const list = [item('old', '2026-11-05T00:00:00Z'), item('yesterday', '2026-11-07T00:00:00Z'), item('soon', '2026-11-10T00:00:00Z')]
    expect(pruneHidden(list, now).map(e => e.key)).toEqual(['yesterday', 'soon'])
  })

  it('caps the list, dropping the oldest', () => {
    const many = Array.from({ length: HIDDEN_FEED_MAX }, (_, i): HiddenFeedEntry => ({ kind: 'host', key: `h${i}`, label: '' }))
    const next = withHidden(many, { kind: 'host', key: 'new', label: '' }, now)
    expect(next).toHaveLength(HIDDEN_FEED_MAX)
    expect(next[0].key).toBe('new')
    expect(next.some(e => e.key === `h${HIDDEN_FEED_MAX - 1}`)).toBe(false)
  })

  it('removes by kind and key', () => {
    const list: HiddenFeedEntry[] = [{ kind: 'host', key: 'x', label: '' }, { kind: 'item', key: 'x', label: '' }]
    expect(withoutHidden(list, { kind: 'host', key: 'x' })).toEqual([{ kind: 'item', key: 'x', label: '' }])
  })

  it('parses what the column holds and skips anything malformed', () => {
    expect(parseHiddenFeed(null)).toEqual([])
    expect(parseHiddenFeed({})).toEqual([])
    expect(parseHiddenFeed([
      { kind: 'venue', key: 'aces', label: 'ACES' },
      { kind: 'item', key: 'e', label: 'E', until: '2026-11-10' },
      { kind: 'bogus', key: 'k', label: 'L' },
      { kind: 'host', key: '', label: 'L' },
      'nope',
    ])).toEqual([
      { kind: 'venue', key: 'aces', label: 'ACES' },
      { kind: 'item', key: 'e', label: 'E', until: '2026-11-10' },
    ])
  })
})
