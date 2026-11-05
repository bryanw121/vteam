const mockInsert = jest.fn()
jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn(() => ({ insert: mockInsert })) } }))

import { supabase } from '../lib/supabase'
import { ANALYTICS_FLUSH_MS, __bufferedEvents, __resetAnalytics, flush, track } from '../lib/analytics'

describe('lib/analytics', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockInsert.mockReset().mockResolvedValue({ error: null })
    ;(supabase.from as jest.Mock).mockClear()
    __resetAnalytics({ enabled: true })
  })
  afterEach(() => jest.useRealTimers())

  it('is a no-op under Jest unless enabled', async () => {
    __resetAnalytics()
    track('banner_shown', { banner: 'x' })
    expect(__bufferedEvents()).toHaveLength(0)
    await flush()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('buffers events and sends them in one insert after the flush interval', async () => {
    track('banner_shown', { banner: 'austin-pilot-v2' })
    track('tour_started', { tour: 'intro', source: 'banner' })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(__bufferedEvents()).toHaveLength(2)

    await jest.advanceTimersByTimeAsync(ANALYTICS_FLUSH_MS)
    expect(supabase.from).toHaveBeenCalledWith('app_events')
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const rows = mockInsert.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'banner_shown', props: { banner: 'austin-pilot-v2' }, platform: expect.any(String) })
    expect(rows[1]).toMatchObject({ name: 'tour_started', props: { tour: 'intro', source: 'banner' } })
    expect(typeof rows[0].anon_id).toBe('string')
    expect(rows[0].anon_id).toBe(rows[1].anon_id)
    expect(rows[0]).not.toHaveProperty('user_id') // the table's default fills it
    expect(__bufferedEvents()).toHaveLength(0)
  })

  it('flush() sends right away; nothing to send means no request', async () => {
    await flush()
    expect(mockInsert).not.toHaveBeenCalled()
    track('tour_completed', { tour: 'intro', step: 5 })
    await flush()
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it('never throws, even when the client throws or rejects', async () => {
    mockInsert.mockImplementation(() => { throw new Error('boom') })
    expect(() => track('tour_skipped', { tour: 'intro', step: 1, target: 'events-calendar' })).not.toThrow()
    await expect(flush()).resolves.toBeUndefined()
    mockInsert.mockRejectedValue(new Error('offline'))
    track('tour_skipped', { tour: 'intro', step: 1, target: null })
    await expect(flush()).resolves.toBeUndefined()
  })

  it('switches itself off when the table does not exist yet', async () => {
    mockInsert.mockResolvedValue({ error: { code: 'PGRST205', message: "Could not find the table 'public.app_events' in the schema cache" } })
    track('banner_shown', { banner: 'a' })
    await flush()
    expect(mockInsert).toHaveBeenCalledTimes(1)
    track('banner_shown', { banner: 'b' })
    expect(__bufferedEvents()).toHaveLength(0)
    await jest.advanceTimersByTimeAsync(ANALYTICS_FLUSH_MS * 2)
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it('drops a rejected batch instead of retrying it', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: '23514', message: 'check constraint' } })
    track('banner_shown', { banner: 'a' })
    await flush()
    await jest.advanceTimersByTimeAsync(ANALYTICS_FLUSH_MS * 2)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    track('banner_shown', { banner: 'b' })
    await flush()
    expect(mockInsert).toHaveBeenCalledTimes(2)
  })

  it('caps oversized props and the buffer size', async () => {
    track('banner_shown', { banner: 'x'.repeat(2000) })
    expect(__bufferedEvents()[0].props).toEqual({})
    for (let i = 0; i < 250; i++) track('tour_step_viewed', { tour: 'intro', step: i, target: 't' })
    expect(__bufferedEvents().length).toBeLessThanOrEqual(200)
    await flush()
    // Batched: at most 50 rows per insert.
    for (const call of mockInsert.mock.calls) expect(call[0].length).toBeLessThanOrEqual(50)
  })
})
