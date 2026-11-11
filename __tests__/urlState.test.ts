import { feedDay, firstParam, flag, oneOf, optionalOneOf, parseIsoDay, queryString, tabIndexCodec, tabSlug, text, withView } from '../utils/urlState'
import { EVENT_TAB_LABELS, TOURNAMENT_TAB_LABELS, VIEW } from '../utils/urlViews'
import { EVENT_TABS } from '../components/event/EventTabBar'
import { TOURNAMENT_TABS } from '../constants/tournamentCopy'
import { isAppPath, routes } from '../utils/routes'
import { clearTabViews, rememberTabParam, tabParams } from '../utils/tabViews'

describe('firstParam', () => {
  it('keeps the first of repeated params and ignores non-strings', () => {
    expect(firstParam(['a', 'b'])).toBe('a')
    expect(firstParam('x')).toBe('x')
    expect(firstParam(undefined)).toBeUndefined()
    expect(firstParam(null)).toBeUndefined()
  })
})

describe('oneOf', () => {
  const c = oneOf(['all', 'open_play', 'tournament'] as const, 'all')
  it('accepts listed words and falls back on anything else', () => {
    expect(c.parse('tournament')).toBe('tournament')
    expect(c.parse(undefined)).toBe('all')
    expect(c.parse('mine')).toBe('all') // a removed filter
    expect(c.parse('TOURNAMENT')).toBe('all')
    expect(c.parse('<script>')).toBe('all')
  })
  it('leaves the default out of the URL', () => {
    expect(c.format('all')).toBeUndefined()
    expect(c.format('open_play')).toBe('open_play')
  })
  it('optionalOneOf means nothing picked', () => {
    const m = optionalOneOf(['reset', 'code'] as const)
    expect(m.parse('reset')).toBe('reset')
    expect(m.parse('admin')).toBeNull()
    expect(m.format(null)).toBeUndefined()
  })
})

describe('text', () => {
  const c = text(10)
  it('strips control characters and caps length', () => {
    expect(c.parse('sa\u0000nd\nx')).toBe('sandx')
    expect(c.parse('a'.repeat(30))).toHaveLength(10)
    expect(c.parse(undefined)).toBe('')
  })
  it('trims and drops empty values', () => {
    expect(c.format('  sand ')).toBe('sand')
    expect(c.format('   ')).toBeUndefined()
  })
})

describe('flag', () => {
  it('reads 1 and true, writes 1 or nothing', () => {
    expect(flag.parse('1')).toBe(true)
    expect(flag.parse('true')).toBe(true)
    expect(flag.parse('yes')).toBe(false)
    expect(flag.format(true)).toBe('1')
    expect(flag.format(false)).toBeUndefined()
  })
})

describe('days', () => {
  it('parseIsoDay accepts only real calendar days', () => {
    expect(parseIsoDay('2026-11-14')).toBe('2026-11-14')
    expect(parseIsoDay('2028-02-29')).toBe('2028-02-29')
    expect(parseIsoDay('2026-02-29')).toBeNull()
    expect(parseIsoDay('2026-13-01')).toBeNull()
    expect(parseIsoDay('2026-11-14T00:00')).toBeNull()
    expect(parseIsoDay('11/14/2026')).toBeNull()
    expect(parseIsoDay(undefined)).toBeNull()
  })
  it('feedDay opens a coming day and falls back to today for past, today or far-off days', () => {
    expect(feedDay('2026-11-14', '2026-11-11')).toBe('2026-11-14')
    expect(feedDay('2026-11-11', '2026-11-11')).toBeNull()
    expect(feedDay('2026-11-01', '2026-11-11')).toBeNull()
    expect(feedDay('2027-11-14', '2026-11-11')).toBeNull()
    expect(feedDay('junk', '2026-11-11')).toBeNull()
  })
})

describe('tab codecs', () => {
  const c = tabIndexCodec(EVENT_TAB_LABELS)
  it('reads words and the old numbers notifications still send', () => {
    expect(c.parse('people')).toBe(1)
    expect(c.parse('Discussion')).toBe(2)
    expect(c.parse('3')).toBe(3) // `?tab=3` from cheers notifications
    expect(c.parse('1')).toBe(1)
    expect(c.parse('9')).toBe(0)
    expect(c.parse('-1')).toBe(0)
    expect(c.parse('teams')).toBe(0)
    expect(c.parse(undefined)).toBe(0)
  })
  it('writes words and leaves the first tab out', () => {
    expect(c.format(0)).toBeUndefined()
    expect(c.format(3)).toBe('cheers')
    expect(tabSlug('Outside Hitter')).toBe('outside-hitter')
  })
  it('stays in step with the screens\' own tab lists', () => {
    expect([...EVENT_TAB_LABELS]).toEqual([...EVENT_TABS])
    expect([...TOURNAMENT_TAB_LABELS]).toEqual([...TOURNAMENT_TABS])
  })
})

describe('queryString / withView', () => {
  it('drops empty values and encodes', () => {
    expect(queryString({ a: 'x', b: undefined, c: '', d: null })).toBe('?a=x')
    expect(queryString({})).toBe('')
    expect(queryString({ q: 'a&b c' })).toBe('?q=a%26b%20c')
  })
  it('builds a path from codecs, leaving defaults out', () => {
    expect(withView('/', VIEW.feed, { type: 'all', surface: 'sand', day: '2026-11-14' })).toBe('/?surface=sand&day=2026-11-14')
    expect(withView('/', VIEW.feed, {})).toBe('/')
  })
})

describe('routes with a view', () => {
  it('builds each screen\'s link', () => {
    expect(routes.events()).toBe('/')
    expect(routes.events({ type: 'tournament', surface: 'any' })).toBe('/?type=tournament')
    expect(routes.event('e1', { tab: 1 })).toBe('/event/e1?tab=people')
    expect(routes.event('e1')).toBe('/event/e1')
    expect(routes.tournament('t1', { tab: 2 })).toBe('/tournament/t1?tab=schedule')
    expect(routes.tournaments({ view: 'past', host: 'Texas Asian Olympics' })).toBe('/tournaments?view=past&host=Texas%20Asian%20Olympics')
    expect(routes.leagues({ host: '' })).toBe('/leagues')
    expect(routes.clubs({ filter: 'popular', q: 'sand' })).toBe('/clubs?filter=popular&q=sand')
    expect(routes.book({ day: '2026-11-15', surface: 'sand' })).toBe('/book?day=2026-11-15&surface=sand')
    expect(routes.profile({ edit: true })).toBe('/profile?edit=1')
    expect(routes.profile()).toBe('/profile')
    expect(routes.badge('event_attendee')).toBe('/settings/badges?badge=event_attendee')
    expect(routes.feedback('bug')).toBe('/settings/feedback?type=bug')
    expect(routes.feedback('feature')).toBe('/settings/feedback')
    expect(routes.metrics('live')).toBe('/settings/metrics?tab=live')
    expect(routes.metrics({ range: 7 })).toBe('/settings/metrics?range=7')
    expect(routes.login({ mode: 'reset' })).toBe('/(auth)/login?mode=reset')
    expect(routes.login()).toBe('/(auth)/login')
  })
  it('every built link is a safe in-app path', () => {
    for (const path of [routes.events({ type: 'tournament' }), routes.clubs({ q: '//evil.com' }), routes.tournaments({ host: 'https://x' })]) {
      expect(isAppPath(path)).toBe(true)
    }
  })
})

describe('tabViews', () => {
  afterEach(clearTabViews)
  it('remembers each tab\'s params separately', () => {
    rememberTabParam('events', 'type', 'tournament')
    rememberTabParam('clubs', 'q', 'sand')
    rememberTabParam('events', 'surface', undefined)
    expect(tabParams('events')).toEqual({ type: 'tournament', surface: undefined })
    expect(queryString(tabParams('events'))).toBe('?type=tournament')
    expect(tabParams('chat')).toEqual({})
  })
})
