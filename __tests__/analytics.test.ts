const mockInsert = jest.fn()
const mockRpc = jest.fn()
jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn(() => ({ insert: mockInsert })), rpc: (...args: unknown[]) => mockRpc(...args) } }))

import { AppState } from 'react-native'
import { supabase } from '../lib/supabase'
import {
  ANALYTICS_FLUSH_MS, HEARTBEAT_MS, SESSION_IDLE_MS, __bufferedEvents, __resetAnalytics, __usageSession, flush,
  isUsageSharingOn, needsNewSession, noteScreen, screenPattern, setUsageSharing, setUsageUser, startUsageTracking, track,
} from '../lib/analytics'

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

describe('usage sessions', () => {
  let appStateListener: ((s: string) => void) | null = null
  beforeEach(() => {
    jest.useFakeTimers()
    mockInsert.mockReset().mockResolvedValue({ error: null })
    mockRpc.mockReset().mockResolvedValue({ error: null })
    appStateListener = null
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
      appStateListener = fn
      return { remove: () => {} }
    }) as unknown as typeof AppState.addEventListener)
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true })
    __resetAnalytics({ enabled: true })
  })
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

  const rows = () => mockInsert.mock.calls.flatMap(c => c[0] as { name: string; props: Record<string, unknown>; session_id: string | null; app_version: string }[])
  const heartbeats = () => mockRpc.mock.calls.filter(c => c[0] === 'app_heartbeat').map(c => c[1] as Record<string, string>)

  it('opens a session, records session_start, and heartbeats every minute while shown', async () => {
    startUsageTracking(null)
    await jest.advanceTimersByTimeAsync(0)
    const session = __usageSession()
    expect(session?.id).toMatch(/^[A-Za-z0-9-]{8,64}$/)
    expect(heartbeats()).toHaveLength(1)
    expect(heartbeats()[0]).toMatchObject({ p_session: session!.id, p_platform: expect.any(String), p_version: expect.any(String) })
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 2)
    expect(heartbeats()).toHaveLength(3)

    await flush()
    const start = rows().find(r => r.name === 'session_start')
    expect(start).toMatchObject({ props: { cold: true }, session_id: session!.id, app_version: expect.any(String) })
  })

  it('pauses heartbeats in the background and opens a new session after 30 minutes away', async () => {
    startUsageTracking('user-1')
    await jest.advanceTimersByTimeAsync(0)
    const first = __usageSession()!.id
    appStateListener!('background')
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 3)
    expect(heartbeats()).toHaveLength(1)

    appStateListener!('active') // back within 30 min: same session
    await jest.advanceTimersByTimeAsync(0)
    expect(__usageSession()!.id).toBe(first)

    appStateListener!('background')
    await jest.advanceTimersByTimeAsync(SESSION_IDLE_MS + 1000)
    appStateListener!('active')
    await jest.advanceTimersByTimeAsync(0)
    expect(__usageSession()!.id).not.toBe(first)
  })

  it('a different account signing in starts a new session', async () => {
    startUsageTracking(null)
    await jest.advanceTimersByTimeAsync(0)
    const guest = __usageSession()!.id
    setUsageUser('user-1')
    expect(__usageSession()).toMatchObject({ userId: 'user-1' })
    expect(__usageSession()!.id).not.toBe(guest)
  })

  it('records screen views only when the screen type changes, and sends it with heartbeats', async () => {
    startUsageTracking(null)
    await jest.advanceTimersByTimeAsync(0)
    noteScreen('/')
    noteScreen('/')
    noteScreen('/event/[id]')
    await flush()
    const views = rows().filter(r => r.name === 'screen_view').map(r => r.props)
    expect(views).toEqual([{ screen: '/' }, { screen: '/event/[id]', from: '/' }])
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(heartbeats().at(-1)).toMatchObject({ p_screen: '/event/[id]' })
  })

  it('turning usage sharing off drops unsent events and stops heartbeats', async () => {
    startUsageTracking(null)
    await jest.advanceTimersByTimeAsync(0)
    track('banner_shown', { banner: 'x' })
    await setUsageSharing(false)
    expect(await isUsageSharingOn()).toBe(false)
    expect(__bufferedEvents()).toHaveLength(0)
    const sent = heartbeats().length
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 2)
    expect(heartbeats()).toHaveLength(sent)
    track('banner_shown', { banner: 'y' })
    await flush()
    expect(rows().filter(r => r.name === 'banner_shown')).toHaveLength(0)
  })

  it('stops heartbeating if the function is missing (migration not applied yet)', async () => {
    mockRpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'Could not find the function public.app_heartbeat' } })
    startUsageTracking(null)
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 3)
    expect(heartbeats()).toHaveLength(1)
  })

  it('does nothing at all when analytics is off (Jest default, automated browsers)', async () => {
    __resetAnalytics()
    startUsageTracking(null)
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 2)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(__usageSession()).toBeNull()
  })
})

describe('needsNewSession / screenPattern', () => {
  it('decides when coming back is a new session', () => {
    const now = 10_000_000
    expect(needsNewSession(null, null, null, now)).toBe(true)
    expect(needsNewSession({ userId: null }, null, null, now)).toBe(false)
    expect(needsNewSession({ userId: null }, 'u', null, now)).toBe(true)
    expect(needsNewSession({ userId: 'u' }, 'u', now - SESSION_IDLE_MS + 1, now)).toBe(false)
    expect(needsNewSession({ userId: 'u' }, 'u', now - SESSION_IDLE_MS - 1, now)).toBe(true)
  })

  it('turns route segments into a screen type without ids or groups', () => {
    expect(screenPattern(['(app)', 'event', '[id]'])).toBe('/event/[id]')
    expect(screenPattern(['(app)', '(tabs)', '(main)', 'index'])).toBe('/')
    expect(screenPattern(['(app)', '(tabs)', 'settings', 'privacy'])).toBe('/settings/privacy')
    expect(screenPattern(['(auth)', 'login'])).toBe('/login')
    expect(screenPattern([])).toBe('/')
  })
})
