import { addRecentSearch, isSearchable, normalizeSearchQuery, orderByIds, parseRecentSearches, parseSearchFeed, searchResultCount } from '../utils/search'
import { routes } from '../utils/routes'
import type { EventWithDetails } from '../types'

describe('search text', () => {
  it('trims, collapses spaces and caps at 60', () => {
    expect(normalizeSearchQuery('  zilker   park ')).toBe('zilker park')
    expect(normalizeSearchQuery('x'.repeat(80))).toHaveLength(60)
  })
  it('needs 2 characters', () => {
    expect(isSearchable(' a ')).toBe(false)
    expect(isSearchable('ab')).toBe(true)
  })
})

describe('parseSearchFeed', () => {
  it('reads the RPC shape and drops anything malformed', () => {
    const r = parseSearchFeed({
      events: ['e1', 2, 'e2'],
      external: [{ id: 'x1', starts_at: '2026-11-20T00:00:00Z' }, { id: 'x2' }],
      hosts: [{ id: 'h1', upcoming: 2 }, null],
      clubs: [{ id: 'c1', name: 'Eastside' }, { id: 'c2' }],
    })
    expect(r.events).toEqual(['e1', 'e2'])
    expect(r.external.map(x => x.id)).toEqual(['x1'])
    expect(r.hosts.map(h => h.id)).toEqual(['h1'])
    expect(r.clubs.map(c => c.id)).toEqual(['c1'])
  })
  it('treats a missing or odd payload as no results', () => {
    for (const raw of [null, [], 'x', {}]) expect(searchResultCount(parseSearchFeed(raw))).toBe(0)
  })
})

it('orderByIds keeps the server ranking and skips cards that did not load', () => {
  const ev = (id: string) => ({ id }) as EventWithDetails
  expect(orderByIds([ev('a'), ev('b'), ev('c')], ['c', 'x', 'a']).map(e => e.id)).toEqual(['c', 'a'])
})

describe('recent searches', () => {
  it('puts the newest first, dedupes case-insensitively and keeps 8', () => {
    let list: string[] = []
    for (const q of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9']) list = addRecentSearch(list, q)
    expect(list).toHaveLength(8)
    expect(list[0]).toBe('i9')
    expect(addRecentSearch(['Zilker', 'sand'], 'zilker ')).toEqual(['zilker', 'sand'])
    expect(addRecentSearch(['sand'], 'a')).toEqual(['sand'])
  })
  it('reads the stored list defensively', () => {
    expect(parseRecentSearches(null)).toEqual([])
    expect(parseRecentSearches('nope')).toEqual([])
    expect(parseRecentSearches('["a", 1, "b"]')).toEqual(['a', 'b'])
  })
})

it('routes.search puts the query and scope in the URL, defaults left out', () => {
  expect(routes.search()).toBe('/search')
  expect(routes.search({ q: 'zilker' })).toBe('/search?q=zilker')
  expect(routes.search({ q: 'sand', scope: 'mine_past' })).toBe('/search?q=sand&scope=mine_past')
})
