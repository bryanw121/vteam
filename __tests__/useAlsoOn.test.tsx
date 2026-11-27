/**
 * "Also on" at the end of a month (#421): on phones the feed holds only the current week's
 * months, so the sheet reads the source's later dates itself and lists next month's.
 */
import { renderHook, waitFor } from '@testing-library/react-native'
import { __resetQueryCache } from '../lib/query'
import { ALSO_ON_MAX, alsoOn, alsoOnNeedsRead, mergeAlsoOn } from '../utils/outsideSession'
import type { ExternalSession } from '../types'

const mockCalls: { filters: [string, string, unknown][]; limit?: number }[] = []
let mockRows: ExternalSession[] = []
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const call = { table, filters: [] as [string, string, unknown][], limit: undefined as number | undefined }
      mockCalls.push(call)
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { call.filters.push(['eq', c, v]); return q },
        gt: (c: string, v: unknown) => { call.filters.push(['gt', c, v]); return q },
        gte: (c: string, v: unknown) => { call.filters.push(['gte', c, v]); return q },
        order: () => q,
        limit: (n: number) => { call.limit = n; return Promise.resolve({ data: mockRows, error: null }) },
      }
      return q
    },
  },
}))

import { useAlsoOn } from '../hooks/useAlsoOn'

const base: ExternalSession = {
  id: 'riverbend-2026-11-27', source_id: 'riverbend', title: 'Riverbend Open Gym', venue: 'Riverbend Rec Center', city: 'Austin',
  surface: 'indoor', session_type: 'Open play', level: null, price: '$8', starts_at: '2026-11-28T00:30:00.000Z', ends_at: null,
  signup_url: 'https://example.com/riverbend', signup_label: null, note: null, verified_at: '2026-11-26T10:00:00.000Z', region: 'austin',
}
const at = (id: string, startsAt: string, over: Partial<ExternalSession> = {}): ExternalSession => ({ ...base, id, starts_at: startsAt, ...over })
const TODAY = '2026-11-27'

beforeEach(() => {
  mockCalls.length = 0
  mockRows = []
  __resetQueryCache()
})

describe('alsoOnNeedsRead', () => {
  it('reads only when the loaded feed found fewer than the sheet lists', () => {
    expect(alsoOnNeedsRead(0)).toBe(true)
    expect(alsoOnNeedsRead(ALSO_ON_MAX - 1)).toBe(true)
    expect(alsoOnNeedsRead(ALSO_ON_MAX)).toBe(false)
  })
})

describe('mergeAlsoOn', () => {
  it('adds next month to a November-only feed (the last week of the month on a phone)', () => {
    const loaded = [base] // phones on Nov 22–28 load November only
    const read = ['2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26', '2027-01-02'].map((d, i) => at(`r${i}`, `${d}T00:30:00.000Z`))
    const out = mergeAlsoOn(base, loaded, read, TODAY)
    expect(out.map(s => s.starts_at.slice(0, 10))).toEqual(['2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26'])
    expect(alsoOn(base, loaded)).toEqual([])
  })

  it('drops a date already in the feed once, and other titles or venues of the same source', () => {
    const dec5 = at('loaded-dec5', '2026-12-05T00:30:00.000Z')
    const read = [at('read-dec5', '2026-12-05T00:30:00.000Z'), at('clinic', '2026-12-06T00:30:00.000Z', { title: 'Clinic' }), at('other-venue', '2026-12-07T00:30:00.000Z', { venue: 'Lantern Hall' })]
    expect(mergeAlsoOn(base, [base, dec5], read, TODAY).map(s => s.id)).toEqual(['loaded-dec5'])
  })

  it('leaves out a read row the feed would hide (scraped source not confirmed for a week)', () => {
    const stale = at('stale', '2026-12-05T00:30:00.000Z', { verified_at: '2026-11-01T10:00:00.000Z' })
    expect(mergeAlsoOn(base, [base], [stale], TODAY)).toEqual([])
  })
})

describe('useAlsoOn', () => {
  it('reads the source\'s later sessions when the feed has too few, with the feed\'s filters', async () => {
    // No verified_at: the hook judges freshness against the real today, which moves.
    mockRows = [at('dec5', '2026-12-05T00:30:00.000Z', { verified_at: null }), at('dec12', '2026-12-12T00:30:00.000Z', { verified_at: null })]
    const { result } = renderHook(() => useAlsoOn(base, [base]))
    await waitFor(() => expect(result.current.map(s => s.id)).toEqual(['dec5', 'dec12']))
    expect(mockCalls).toHaveLength(1)
    const f = mockCalls[0].filters
    expect(f).toContainEqual(['eq', 'source_id', 'riverbend'])
    expect(f).toContainEqual(['gt', 'starts_at', base.starts_at])
    expect(f).toContainEqual(['eq', 'canceled', false])
    expect(f.some(([op, c]) => op === 'gte' && c === 'updated_at')).toBe(true)
  })

  it('makes no request when the loaded feed already fills the list', () => {
    const loaded = [base, ...['2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26'].map((d, i) => at(`l${i}`, `${d}T00:30:00.000Z`))]
    const { result } = renderHook(() => useAlsoOn(base, loaded))
    expect(result.current).toHaveLength(ALSO_ON_MAX)
    expect(mockCalls).toHaveLength(0)
  })

  it('makes no request with no session open', () => {
    const { result } = renderHook(() => useAlsoOn(null, [base]))
    expect(result.current).toEqual([])
    expect(mockCalls).toHaveLength(0)
  })
})
