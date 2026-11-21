import { bucketFeed } from '../hooks/feed/fetch'
import { localDate } from './helpers/clock'
import type { EventCardPreviews, EventWithDetails } from '../types'

jest.mock('../lib/supabase', () => ({ supabase: {} }))

// #343: the feed's merge step, tested directly now that it lives in hooks/feed/fetch.ts.
const ev = (id: string, at: Date) => ({ id, event_date: at.toISOString(), attendee_previews: [] }) as unknown as EventWithDetails

describe('bucketFeed', () => {
  it('buckets by local month, every month of the span present, sorted within a month', () => {
    const late = ev('b', localDate(2026, 11, 28, 19))
    const early = ev('a', localDate(2026, 11, 2, 9))
    const dec = ev('c', localDate(2026, 12, 1, 0, 30))
    const out = bucketFeed(['2026-11', '2026-12', '2027-01'], [late, dec, early], null, null, new Map())
    expect(Object.keys(out)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(out['2026-11'].map(e => e.id)).toEqual(['a', 'b'])
    expect(out['2026-12'].map(e => e.id)).toEqual(['c'])
    expect(out['2027-01']).toEqual([])
  })

  it('leaves out rows outside the span', () => {
    const out = bucketFeed(['2026-11'], [ev('x', localDate(2026, 10, 31, 23, 59))], null, null, new Map())
    expect(out['2026-11']).toEqual([])
  })

  it('applies the newest avatar previews to club events', () => {
    const previews: EventCardPreviews = new Map([['a', [{ id: 'p1' }]]]) as unknown as EventCardPreviews
    const out = bucketFeed(['2026-11'], [ev('a', localDate(2026, 11, 5, 18))], null, null, previews)
    expect(out['2026-11'][0].attendee_previews).toEqual([{ id: 'p1' }])
  })
})
