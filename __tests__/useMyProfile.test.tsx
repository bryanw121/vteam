import React from 'react'
import { Text } from 'react-native'
import { render, act } from '@testing-library/react-native'
import { __resetQueryCache, getQueryData, setQueryData } from '../lib/query'
import {
  PROFILE_BRIEF_SELECT,
  myCheersCountKey,
  myProfileKey,
  normalizeProfileRow,
  profileBriefKey,
  useMyCheersCount,
  useMyProfile,
} from '../hooks/useMyProfile'
import type { MyProfile } from '../types'
import type { QueryResult } from '../lib/query'

jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))
jest.mock('../lib/sentry', () => ({ Sentry: { captureException: jest.fn() } }))
jest.mock('../contexts/session', () => ({
  useSession: () => ({ session: null, userId: 'u1', isGuest: false, loading: false }),
}))

type Result = { data: unknown; error: unknown; count?: number | null }
let mockSelectCalls: { table: string; columns: string; options?: unknown }[]
let mockUpdateCalls: { table: string; patch: unknown; id: string }[]
let mockQueued: Record<string, Result[]>
let mockUpdateResult: { error: unknown }

jest.mock('../lib/supabase', () => {
  const makeSelect = (table: string) => (columns: string, options?: unknown) => {
    mockSelectCalls.push({ table, columns, options })
    const take = () => (mockQueued[table] ?? []).shift() ?? { data: null, error: null }
    const chain: Record<string, unknown> = {}
    chain.eq = () => chain
    chain.single = () => Promise.resolve(take())
    chain.maybeSingle = () => Promise.resolve(take())
    chain.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(take()).then(resolve, reject)
    return chain
  }
  const makeUpdate = (table: string) => (patch: unknown) => ({
    eq: (_col: string, id: string) => {
      mockUpdateCalls.push({ table, patch, id })
      return Promise.resolve(mockUpdateResult)
    },
  })
  return {
    supabase: {
      from: (table: string) => ({
        select: makeSelect(table),
        update: makeUpdate(table),
        upsert: (row: unknown) => {
          mockUpdateCalls.push({ table, patch: row, id: (row as { user_id: string }).user_id })
          return Promise.resolve(mockUpdateResult)
        },
      }),
    },
  }
})

const ROW = {
  id: 'u1',
  username: 'bryan',
  first_name: 'Bryan',
  last_name: null,
  avatar_url: null,
  position: ['setter'],
  skill_level: 'bb',
  created_at: '2025-01-01T00:00:00Z',
  selected_border: null,
  selected_card_bg: null,
  bio: null,
  notification_prefs: null,
}

let me: MyProfile
let cheers: QueryResult<number>

function Probe() {
  me = useMyProfile()
  cheers = useMyCheersCount()
  return <Text>{me.profile?.username ?? (me.isLoading ? 'loading' : 'none')}</Text>
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

beforeEach(() => {
  __resetQueryCache()
  mockSelectCalls = []
  mockUpdateCalls = []
  mockQueued = {}
  mockUpdateResult = { error: null }
})

describe('PROFILE_BRIEF_SELECT', () => {
  it('lists explicit public columns only', () => {
    const cols = PROFILE_BRIEF_SELECT.split(',').map(c => c.trim())
    expect(cols).not.toContain('*')
    expect(cols).not.toContain('is_admin')
    expect(cols).not.toContain('notification_prefs')
    expect(cols).toEqual(expect.arrayContaining(['id', 'username', 'avatar_url', 'position', 'selected_border']))
  })
})

describe('normalizeProfileRow', () => {
  it('turns missing optionals into null / empty list', () => {
    const p = normalizeProfileRow({ id: 'u1', username: 'x', created_at: 'now', position: null as never })
    expect(p.position).toEqual([])
    expect(p.skill_level).toBeNull()
    expect(p.bio).toBeNull()
    expect(p.selected_border).toBeNull()
  })
})

describe('useMyProfile', () => {
  it('loads the signed-in user\'s profile with explicit columns', async () => {
    mockQueued.profiles = [{ data: ROW, error: null }]
    mockQueued.cheers = [{ data: null, error: null, count: 4 }]
    const view = render(<Probe />)
    await flush()
    expect(view.getByText('bryan')).toBeTruthy()
    expect(me.profile?.skill_level).toBe('bb')
    const profileSelect = mockSelectCalls.find(c => c.table === 'profiles')!
    expect(profileSelect.columns).not.toContain('*')
    expect(profileSelect.columns).toContain(PROFILE_BRIEF_SELECT)
    expect(getQueryData(myProfileKey('u1'))).toBe(me.profile)
  })

  it('surfaces a failed load as an error with isLoading false (no endless spinner)', async () => {
    mockQueued.profiles = [{ data: null, error: { message: 'boom' } }]
    render(<Probe />)
    await flush()
    expect(me.profile).toBeUndefined()
    expect(me.error?.message).toBe('boom')
    expect(me.isLoading).toBe(false)
  })

  it('retries via refetch({ force }) after an error', async () => {
    mockQueued.profiles = [{ data: null, error: { message: 'boom' } }, { data: ROW, error: null }]
    render(<Probe />)
    await flush()
    expect(me.error).not.toBeNull()
    await act(async () => { await me.refetch({ force: true }) })
    expect(me.error).toBeNull()
    expect(me.profile?.username).toBe('bryan')
  })

  it('applies an update optimistically, then keeps it once the write succeeds', async () => {
    mockQueued.profiles = [{ data: ROW, error: null }]
    render(<Probe />)
    await flush()
    let saved: boolean | undefined
    await act(async () => { saved = await me.updateProfile({ bio: 'hi', selected_border: 'gold' }) })
    expect(saved).toBe(true)
    expect(mockUpdateCalls).toEqual([{ table: 'profiles', patch: { bio: 'hi', selected_border: 'gold' }, id: 'u1' }])
    expect(me.profile?.bio).toBe('hi')
    expect(me.profile?.selected_border).toBe('gold')
  })

  it('reads and writes notification prefs in user_settings, never on the public profiles row', async () => {
    mockQueued.profiles = [{ data: ROW, error: null }]
    mockQueued.user_settings = [{ data: { notification_prefs: { push: { kudos: false }, in_app: {} } }, error: null }]
    render(<Probe />)
    await flush()
    expect(mockSelectCalls.find(c => c.table === 'profiles')?.columns).not.toContain('notification_prefs')
    expect(me.profile?.notification_prefs).toEqual({ push: { kudos: false }, in_app: {} })

    const prefs = { push: { kudos: true }, in_app: {} }
    await act(async () => { await me.updateProfile({ notification_prefs: prefs as never, bio: 'x' }) })
    expect(mockUpdateCalls).toEqual([
      expect.objectContaining({ table: 'user_settings', patch: expect.objectContaining({ user_id: 'u1', notification_prefs: prefs }) }),
      { table: 'profiles', patch: { bio: 'x' }, id: 'u1' },
    ])
  })

  it('rolls the cache back and reports false when the write fails', async () => {
    mockQueued.profiles = [{ data: ROW, error: null }, { data: ROW, error: null }]
    render(<Probe />)
    await flush()
    mockUpdateResult = { error: { message: 'denied' } }
    let saved: boolean | undefined
    await act(async () => { saved = await me.updateProfile({ bio: 'nope' }) })
    await flush()
    expect(saved).toBe(false)
    expect(me.profile?.bio).toBeNull()
    expect(me.saveError?.message).toBe('denied')
  })

  it('queues a save made while one is in flight instead of dropping it (latest value wins, no false failure)', async () => {
    mockQueued.profiles = [{ data: ROW, error: null }]
    render(<Probe />)
    await flush()
    let release!: (r: { error: unknown }) => void
    mockUpdateResult = new Promise(res => { release = res }) as unknown as { error: unknown }

    const results: boolean[] = []
    act(() => {
      void me.updateProfile({ selected_border: 'gold' }).then(r => { results.push(r) })
      void me.updateProfile({ selected_border: 'bronze' }).then(r => { results.push(r) })
      void me.updateProfile({ bio: 'hi' }).then(r => { results.push(r) })
    })
    // All three show at once; only the first is on the wire.
    expect(me.profile?.selected_border).toBe('bronze')
    expect(me.profile?.bio).toBe('hi')
    expect(mockUpdateCalls).toHaveLength(1)

    mockUpdateResult = { error: null }
    await act(async () => { release({ error: null }) })
    await flush()
    expect(mockUpdateCalls.map(c => c.patch)).toEqual([{ selected_border: 'gold' }, { selected_border: 'bronze', bio: 'hi' }])
    expect(results).toEqual([true, true, true])
    expect(me.profile?.selected_border).toBe('bronze')
  })

  it('keeps the shared brief profile (chat, event page) in step after a save', async () => {
    mockQueued.profiles = [{ data: ROW, error: null }]
    render(<Probe />)
    await flush()
    setQueryData(profileBriefKey('u1'), { id: 'u1', username: 'bryan', first_name: 'Old', last_name: null, avatar_url: null, selected_border: null })
    await act(async () => { await me.updateProfile({ first_name: 'New', selected_border: 'gold' }) })
    expect(getQueryData(profileBriefKey('u1'))).toEqual({
      id: 'u1', username: 'bryan', first_name: 'New', last_name: null, avatar_url: null, selected_border: 'gold',
    })
  })
})

describe('useMyCheersCount', () => {
  it('asks for an exact head-only count of cheers received by the user', async () => {
    mockQueued.profiles = [{ data: ROW, error: null }]
    mockQueued.cheers = [{ data: null, error: null, count: 7 }]
    render(<Probe />)
    await flush()
    const call = mockSelectCalls.find(c => c.table === 'cheers')!
    expect(call.columns).toBe('id')
    expect(call.options).toEqual({ count: 'exact', head: true })
    expect(cheers.data).toBe(7)
    expect(getQueryData(myCheersCountKey('u1'))).toBe(7)
  })

  it('reads a null count as zero', async () => {
    mockQueued.profiles = [{ data: ROW, error: null }]
    mockQueued.cheers = [{ data: null, error: null, count: null }]
    render(<Probe />)
    await flush()
    expect(cheers.data).toBe(0)
  })

  it('keeps the last known count when a refresh fails', async () => {
    mockQueued.profiles = [{ data: ROW, error: null }]
    mockQueued.cheers = [{ data: null, error: null, count: 7 }, { data: null, error: { message: 'offline' } }]
    render(<Probe />)
    await flush()
    await act(async () => { await cheers.refetch({ force: true }) })
    expect(cheers.data).toBe(7)
    expect(cheers.error?.message).toBe('offline')
  })
})
