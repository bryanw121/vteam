/**
 * #185: the public profile, history and cheers screens read through lib/query.
 * Fetchers are tested against a fake Supabase that records each query's
 * filters; the screens are checked to contain no direct reads any more.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { fetchUserProfile, userProfileKey } from '../hooks/useUserProfile'
import { fetchEventHistory, eventHistoryKey, HISTORY_LIMIT } from '../hooks/useEventHistory'
import { fetchCheersSummary, cheersSummaryKey } from '../hooks/useCheersSummary'
import { USER_SCOPED_PREFIXES } from '../hooks/useCacheUserScope'

jest.mock('../lib/sentry', () => ({ Sentry: { captureException: jest.fn() } }))

type Result = { data: unknown; error: unknown; count?: number | null }
type Call = { table: string; columns: string; ops: string[] }
let mockCalls: Call[]
let mockQueued: Record<string, Result[]>

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        const call: Call = { table, columns, ops: [] }
        mockCalls.push(call)
        const take = () => (mockQueued[table] ?? []).shift() ?? { data: [], error: null }
        const chain: Record<string, unknown> = {}
        for (const op of ['eq', 'lt', 'gte', 'not', 'order', 'limit']) {
          chain[op] = (...args: unknown[]) => { call.ops.push(`${op}(${args.map(a => JSON.stringify(a)).join(',')})`); return chain }
        }
        chain.maybeSingle = () => Promise.resolve(take())
        chain.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(take()).then(resolve, reject)
        return chain
      },
    }),
  },
}))

beforeEach(() => {
  mockCalls = []
  mockQueued = {}
})

const ROW = { id: 'p1', username: 'maya', first_name: 'Maya', last_name: 'C', avatar_url: null, position: ['setter'], skill_level: 'bb', created_at: '2025-01-01T00:00:00Z' }

describe('fetchUserProfile', () => {
  it('loads the profile, cheers count and shown badges together', async () => {
    mockQueued = {
      profiles: [{ data: ROW, error: null }],
      cheers: [{ data: null, error: null, count: 7 }],
      user_badges: [{ data: [{ id: 'b1', display_order: 1 }], error: null }],
    }
    const data = await fetchUserProfile('p1')
    expect(data?.profile.username).toBe('maya')
    expect(data?.totalCheers).toBe(7)
    expect(data?.displayBadges).toHaveLength(1)
    expect(mockCalls.map(c => c.table).sort()).toEqual(['cheers', 'profiles', 'user_badges'])
  })

  it('is null for a player that does not exist (Profile not found)', async () => {
    mockQueued = { profiles: [{ data: null, error: null }] }
    await expect(fetchUserProfile('nobody')).resolves.toBeNull()
  })

  it('throws on any other failure, so the screen shows Retry rather than "not found"', async () => {
    mockQueued = { profiles: [{ data: null, error: { message: 'Failed to fetch' } }] }
    await expect(fetchUserProfile('p1')).rejects.toEqual({ message: 'Failed to fetch' })
  })

  it('is keyed per player, outside the user-scoped prefixes (public data)', () => {
    expect(userProfileKey('p1')).toBe('user:p1')
    expect(USER_SCOPED_PREFIXES).not.toContain('user')
  })
})

describe('fetchEventHistory', () => {
  it('attended: past events where the viewer was attending, newest first, capped', async () => {
    await fetchEventHistory('attended', 'u1')
    const ops = mockCalls[0].ops.join(' ')
    expect(mockCalls[0].columns).toContain('event_attendees!inner(user_id, status)')
    expect(ops).toContain('eq("event_attendees.user_id","u1")')
    expect(ops).toContain('eq("event_attendees.status","attending")')
    expect(ops).toContain('lt("event_date"')
    expect(ops).toContain(`limit(${HISTORY_LIMIT})`)
  })

  it('hosted-past and hosted-upcoming split on now, upcoming soonest first', async () => {
    await fetchEventHistory('hosted-past', 'u1')
    await fetchEventHistory('hosted-upcoming', 'u1')
    expect(mockCalls[0].ops.join(' ')).toMatch(/eq\("created_by","u1"\).*lt\("event_date"/)
    expect(mockCalls[1].ops.join(' ')).toMatch(/gte\("event_date".*order\("event_date",\{"ascending":true\}\)/)
  })

  it('throws on error and is cleared with the signed-in user', async () => {
    mockQueued = { events: [{ data: null, error: { message: 'boom' } }] }
    await expect(fetchEventHistory('attended', 'u1')).rejects.toEqual({ message: 'boom' })
    expect(eventHistoryKey('attended', 'u1')).toBe('history:attended:u1')
    expect(USER_SCOPED_PREFIXES).toContain('history')
  })
})

describe('fetchCheersSummary', () => {
  it('counts received cheers by type and the given total', async () => {
    mockQueued = {
      cheers: [
        { data: [{ cheer_type: 'spike' }, { cheer_type: 'spike' }, { cheer_type: 'block' }], error: null },
        { data: null, error: null, count: 4 },
      ],
    }
    await expect(fetchCheersSummary('u1')).resolves.toEqual({ totalReceived: 3, totalGiven: 4, counts: { spike: 2, block: 1 } })
    expect(cheersSummaryKey('u1')).toBe('cheersSummary:u1')
    expect(USER_SCOPED_PREFIXES).toContain('cheersSummary')
  })
})

describe('screens read through hooks (#185)', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
  it.each([
    'app/(app)/profile/[id].tsx',
    'app/(app)/(tabs)/settings/history.tsx',
    'app/(app)/(tabs)/settings/hosted.tsx',
    'app/(app)/(tabs)/settings/cheers.tsx',
  ])('%s has no direct Supabase reads and renders through ScreenState', file => {
    const src = read(file)
    expect(src).not.toMatch(/supabase\./)
    expect(src).toMatch(/<ScreenState/)
  })
})
