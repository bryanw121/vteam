/** #217 part 2: the Events feed's section rules, without the screen. */
import { buildFeedSections, matchesFeedType } from '../utils/feedSections'
import { normalizeExternalSessions } from '../utils/feedItems'
import { localDate } from './helpers/clock'
import type { EventWithDetails, ExternalSession, FeedSectionOptions } from '../types'

const at = (y: number, m: number, d: number, h = 18) => localDate(y, m, d, h).toISOString()
const tag = (name: string) => ({ tags: { id: name, name, category: 'event_type' } })

function ev(id: string, date: string, f: Partial<EventWithDetails> = {}): EventWithDetails {
  return { id, event_date: date, event_tags: [], surface: 'indoor', ...f } as unknown as EventWithDetails
}

const session: ExternalSession = {
  id: 'x1', source_id: 'reclub', title: 'Coed', venue: 'Gym', city: null, surface: 'sand',
  session_type: 'Open play', level: null, price: null,
  starts_at: at(2026, 11, 20), ends_at: null, signup_url: 'https://reclub.co/m/x', signup_label: null,
  note: null, region: 'austin', verified_at: '2026-11-13',
}

const base: FeedSectionOptions = { filter: 'all', surface: 'any', region: 'austin', isHidden: () => false, revealed: new Set() }

const open = ev('open', at(2026, 11, 20, 19), { event_tags: [tag('Open Play')] } as Partial<EventWithDetails>)
const cup = ev('cup', at(2026, 11, 21), { event_tags: [tag('Tournament')], surface: 'grass' } as Partial<EventWithDetails>)
const early = ev('early', at(2026, 11, 20, 9))
const [outside] = normalizeExternalSessions([session])
const [elsewhere] = normalizeExternalSessions([{ ...session, id: 'x2', region: 'houston' }])
const all = [cup, open, outside, elsewhere, early]

describe('buildFeedSections', () => {
  it('groups by local day, sorted by time, and drops other regions', () => {
    const { sections } = buildFeedSections(all, base)
    expect(sections.map(s => s.date)).toEqual(['2026-11-20', '2026-11-21'])
    expect(sections[0].data.map(e => e.id)).toEqual(['early', outside.id, 'open'])
    expect(sections.flatMap(s => s.data).some(e => e.id === elsewhere.id)).toBe(false)
  })

  it('filters by type', () => {
    const ids = (filter: FeedSectionOptions['filter']) =>
      buildFeedSections(all, { ...base, filter }).sections.flatMap(s => s.data.map(e => e.id))
    expect(ids('open_play')).toEqual([outside.id, 'open'])
    expect(ids('tournament')).toEqual(['cup'])
  })

  it('filters by surface, outside sessions included', () => {
    const ids = buildFeedSections(all, { ...base, surface: 'sand' }).sections.flatMap(s => s.data.map(e => e.id))
    expect(ids).toEqual([outside.id])
  })

  it('counts hidden items and leaves them out unless the day or month is revealed', () => {
    const isHidden = (e: EventWithDetails) => e.id === 'early'
    const closed = buildFeedSections(all, { ...base, isHidden })
    expect(closed.sections[0]).toMatchObject({ hiddenCount: 1, revealed: false })
    expect(closed.sections[0].data.map(e => e.id)).not.toContain('early')
    expect([...closed.hiddenItemIds]).toEqual(['early'])

    for (const key of ['2026-11-20', '2026-11']) {
      const open = buildFeedSections(all, { ...base, isHidden, revealed: new Set([key]) })
      expect(open.sections[0].revealed).toBe(true)
      expect(open.sections[0].data.map(e => e.id)).toContain('early')
    }
  })

  it('keeps a day whose only item is hidden, so its "N hidden" row still shows', () => {
    const { sections } = buildFeedSections([early], { ...base, isHidden: () => true })
    expect(sections).toEqual([{ date: '2026-11-20', data: [], hiddenCount: 1, revealed: false }])
  })

  it('leaves the caller rows untouched', () => {
    const rows = [cup, early]
    buildFeedSections(rows, base)
    expect(rows.map(e => e.id)).toEqual(['cup', 'early'])
  })
})

describe('matchesFeedType', () => {
  it('reads tags case-insensitively, open-play spelled either way', () => {
    expect(matchesFeedType(ev('a', at(2026, 1, 1), { event_tags: [tag('open-play')] } as Partial<EventWithDetails>), 'open_play')).toBe(true)
    expect(matchesFeedType(ev('b', at(2026, 1, 1)), 'tournament')).toBe(false)
    expect(matchesFeedType(ev('c', at(2026, 1, 1)), 'all')).toBe(true)
  })
})
