import { act, renderHook } from '@testing-library/react-native'
import { __resetQueryCache } from '../lib/query'
import { generateSchedule } from '../lib/tournamentSchedule'

// expo-router's real useFocusEffect needs a navigator; nothing here focuses.
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

// Alerts: record instead of showing.
const mockNotify = jest.fn()
jest.mock('../utils/notify', () => ({
  notifyInfo: (...a: unknown[]) => mockNotify(...a),
  notifyError: (...a: unknown[]) => mockNotify(...a),
}))

/**
 * A mockFake PostgREST client that never answers on its own. Every awaited query is
 * recorded with the "wave" it started in; `settleWave()` answers everything pending
 * and starts the next wave. Requests issued in the same wave were sent without
 * waiting on one another, so the number of distinct waves = sequential round trips.
 */
type Req = { kind: 'from' | 'rpc'; name: string; ops: string[]; wave: number }
const mockFake = {
  requests: [] as Req[],
  pending: [] as (() => void)[],
  wave: 0,
  fixtures: {} as Record<string, unknown>,
  errors: {} as Record<string, { message: string }>,
  rpcResult: { data: 1 as unknown, error: null as null | { message: string } },
}

function mockAnswer(name: string, single: boolean) {
  if (mockFake.errors[name]) return { data: null, error: mockFake.errors[name] }
  const fixture = mockFake.fixtures[name]
  if (single) return { data: Array.isArray(fixture) ? fixture[0] ?? null : fixture ?? null, error: null }
  return { data: fixture ?? [], error: null }
}

function mockBuilder(table: string) {
  const ops: string[] = []
  let single = false
  const b: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          mockFake.requests.push({ kind: 'from', name: table, ops: [...ops], wave: mockFake.wave })
          return new Promise(r => mockFake.pending.push(() => r(mockAnswer(table, single)))).then(resolve, reject)
        }
      }
      return (...args: unknown[]) => {
        ops.push(prop === 'select' ? `select:${String(args[0] ?? '*').trim()}` : prop)
        if (prop === 'maybeSingle' || prop === 'single') single = true
        return b
      }
    },
  })
  return b
}

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockBuilder(table),
    rpc: (name: string, args: unknown) => ({
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        mockFake.requests.push({ kind: 'rpc', name, ops: [JSON.stringify(args)], wave: mockFake.wave })
        return new Promise(r => mockFake.pending.push(() => r({ ...mockFake.rpcResult }))).then(resolve, reject)
      },
    }),
  },
}))

// Imported after the mocks so they pick up the mockFake client.
import { useTournamentData } from '../hooks/tournament/useTournamentData'
import { useTournamentActions } from '../hooks/tournament/useTournamentActions'

async function microtasks() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  })
}

/** Answer everything pending, then let React and follow-up fetches run. */
async function settleWave() {
  const run = mockFake.pending
  mockFake.pending = []
  mockFake.wave++
  run.forEach(f => f())
  await microtasks()
}

async function settleAll() {
  await microtasks() // let mount effects start their fetches
  for (let i = 0; i < 6 && mockFake.pending.length > 0; i++) await settleWave()
}

const waves = () => new Set(mockFake.requests.map(r => r.wave)).size
const tables = () => mockFake.requests.filter(r => r.kind === 'from').map(r => r.name).sort()

const TOURNAMENT = {
  id: 't1', club_id: 'c1', created_by: 'org', title: 'Fall Classic', description: null, location: 'Roots',
  skill_levels: ['b'], start_date: '2026-11-01T15:00:00Z', registration_deadline: null, status: 'published',
  format: 'pool_bracket', bracket_type: 'single', max_teams: 8, min_roster_size: 6, max_roster_size: 10,
  teams_advance_per_pool: 2, has_refs: false, price: 0, venmo_handle: null, schedule_published: false,
  match_duration_minutes: 45, break_duration_minutes: 10, num_courts: 1, schedule_generated_at: null,
  published_at: null, cancelled_at: null, created_at: '2026-10-01T00:00:00Z',
}

beforeEach(() => {
  __resetQueryCache()
  mockFake.requests = []
  mockFake.pending = []
  mockFake.wave = 0
  mockFake.fixtures = { tournaments: TOURNAMENT }
  mockFake.errors = {}
  mockFake.rpcResult = { data: 1, error: null }
  mockNotify.mockClear()
})

describe('useTournamentData: cold open', () => {
  it('signed in: every read starts together, in a single request round', async () => {
    renderHook(() => useTournamentData('t1', 'u1', { loadMatches: false }))
    await microtasks()
    expect(mockFake.pending.length).toBe(mockFake.requests.length) // nothing waited on anything else

    await settleAll()
    expect(waves()).toBe(1)
    expect(tables()).toEqual([
      'profiles',
      // The newest comment page and every announcement, in parallel (#8).
      'tournament_comments',
      'tournament_comments',
      'tournament_prizes',
      'tournament_rules',
      'tournament_team_invitations',
      'tournament_team_join_requests',
      'tournament_team_members',
      'tournament_teams',
      'tournaments',
    ])
  })

  it('guest: core + teams + comments, one round, no per-user queries', async () => {
    renderHook(() => useTournamentData('t1', null, { loadMatches: false }))
    await settleAll()
    expect(waves()).toBe(1)
    expect(tables()).toEqual(['tournament_comments', 'tournament_comments', 'tournament_prizes', 'tournament_rules', 'tournament_teams', 'tournaments'])
  })

  it('matches are fetched only once the Schedule tab asks for them', async () => {
    const { rerender } = renderHook((p: { loadMatches: boolean }) => useTournamentData('t1', null, p), {
      initialProps: { loadMatches: false },
    })
    await settleAll()
    expect(tables()).not.toContain('tournament_matches')

    rerender({ loadMatches: true })
    await settleAll()
    expect(tables()).toContain('tournament_matches')
  })

  it('never selects *', async () => {
    renderHook(() => useTournamentData('t1', 'u1', { loadMatches: true }))
    await settleAll()
    const selects = mockFake.requests.flatMap(r => r.ops).filter(o => o.startsWith('select:'))
    expect(selects.length).toBeGreaterThan(8)
    selects.forEach(o => expect(o).not.toBe('select:*'))
  })

  it('exposes the tournament once loaded', async () => {
    const { result } = renderHook(() => useTournamentData('t1', null, { loadMatches: false }))
    expect(result.current.core.isLoading).toBe(true)
    await settleAll()
    expect(result.current.core.data?.tournament?.title).toBe('Fall Classic')
    expect(result.current.core.data?.prizes).toEqual([])
  })

  it('a failed tournament query surfaces as an error, not an empty page', async () => {
    mockFake.errors.tournaments = { message: 'boom' }
    const { result } = renderHook(() => useTournamentData('t1', null, { loadMatches: false }))
    await settleAll()
    expect(result.current.core.error?.message).toBe('boom')
    expect(result.current.core.data).toBeUndefined()
    expect(result.current.core.isLoading).toBe(false)
  })

  it('a missing tournament is data with tournament: null', async () => {
    mockFake.fixtures = {}
    const { result } = renderHook(() => useTournamentData('t1', null, { loadMatches: false }))
    await settleAll()
    expect(result.current.core.error).toBeNull()
    expect(result.current.core.data?.tournament).toBeNull()
  })

  it('merges a free-agent entry and a real team into the real team', async () => {
    mockFake.fixtures = {
      tournaments: TOURNAMENT,
      tournament_team_members: [
        { team_id: 'fa', tournament_teams: { id: 'fa', status: 'free_agent' } },
        { team_id: 'tm', tournament_teams: { id: 'tm', status: 'registered' } },
      ],
    }
    const { result } = renderHook(() => useTournamentData('t1', 'u1', { loadMatches: false }))
    await settleAll()
    expect(result.current.mine.data?.team?.id).toBe('tm')
  })
})

describe('useTournamentActions', () => {
  it('accepting an invite is ONE rpc call and no separate table writes', async () => {
    const { result } = renderHook(() => useTournamentActions('t1', 'u1'))
    let outcome: unknown
    await act(async () => {
      const p = result.current.acceptInvite.mutate('inv-1')
      await Promise.resolve()
      await settleWave()
      outcome = await p
    })
    expect(outcome).toBe(true)
    expect(mockFake.requests.filter(r => r.kind === 'rpc')).toEqual([
      { kind: 'rpc', name: 'accept_tournament_invite', ops: [JSON.stringify({ p_invite_id: 'inv-1' })], wave: 0 },
    ])
    expect(mockFake.requests.filter(r => r.kind === 'from' && r.ops.some(o => ['insert', 'update', 'delete', 'upsert'].includes(o)))).toEqual([])
  })

  it('a failed accept tells the user and reports failure', async () => {
    mockFake.rpcResult = { data: null, error: { message: 'This invitation is no longer pending' } }
    const { result } = renderHook(() => useTournamentActions('t1', 'u1'))
    let outcome: unknown = 'unset'
    await act(async () => {
      const p = result.current.acceptInvite.mutate('inv-1')
      await Promise.resolve()
      await settleWave()
      outcome = await p
    })
    expect(outcome).toBeUndefined()
    expect(mockNotify).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'This invitation is no longer pending' }))
  })

  it('replacing the schedule is ONE rpc carrying the generated pools and matches', async () => {
    const schedule = generateSchedule({
      format: 'pool_play',
      startDate: new Date('2026-11-01T15:00:00Z'),
      teamIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      config: { numCourts: 2, matchDuration: 45, breakDuration: 10, gamesPerTeam: null, teamsPerPool: null, restBetweenMatches: false },
      random: () => 0.3,
    })
    const { result } = renderHook(() => useTournamentActions('t1', 'org'))
    await act(async () => {
      const p = result.current.replaceSchedule.mutate(schedule)
      await Promise.resolve()
      await settleWave()
      await p
    })
    expect(mockFake.requests).toHaveLength(1)
    const [req] = mockFake.requests
    expect(req).toMatchObject({ kind: 'rpc', name: 'replace_tournament_schedule' })
    expect(JSON.parse(req.ops[0])).toEqual({
      p_tournament_id: 't1',
      p_matches: JSON.parse(JSON.stringify(schedule.matches)),
      p_pools: JSON.parse(JSON.stringify(schedule.pools)),
    })
  })

  it('a failed schedule replace is reported, not swallowed', async () => {
    mockFake.rpcResult = { data: null, error: { message: 'Only the organizer can change the schedule' } }
    const { result } = renderHook(() => useTournamentActions('t1', 'u1'))
    await act(async () => {
      const p = result.current.replaceSchedule.mutate({ pools: [], matches: [], bracket: [] })
      await Promise.resolve()
      await settleWave()
      await p
    })
    expect(mockNotify).toHaveBeenCalledTimes(1)
  })

  it('a write that RLS silently ignores (0 rows) is reported as a failure', async () => {
    mockFake.fixtures = { tournament_teams: [] } // update ... select('id') returns no rows
    const { result } = renderHook(() => useTournamentActions('t1', 'u1'))
    let outcome: unknown = 'unset'
    await act(async () => {
      const p = result.current.approveTeam.mutate('team-1')
      await Promise.resolve()
      await settleWave()
      outcome = await p
    })
    expect(outcome).toBeUndefined()
    expect(mockNotify).toHaveBeenCalled()
  })

  async function runToEnd(p: Promise<unknown>) {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve()
      await settleWave()
    }
    return p
  }

  it('schedule with refs and a bracket: the RPC, then one update per ref team, then one bracket insert', async () => {
    mockFake.fixtures = { tournament_matches: [{ id: 'x' }] }
    const schedule = generateSchedule({
      format: 'round_robin',
      startDate: new Date('2026-11-01T15:00:00Z'),
      teamIds: ['a', 'b', 'c'],
      refs: true,
      config: { numCourts: 1, matchDuration: 45, breakDuration: 10, gamesPerTeam: null, teamsPerPool: null, restBetweenMatches: false },
    })
    const bracket = generateSchedule({
      format: 'bracket', startDate: new Date('2026-11-01T15:00:00Z'), teamIds: ['a', 'b'],
      config: { numCourts: 1, matchDuration: 45, breakDuration: 10, gamesPerTeam: null, teamsPerPool: null, restBetweenMatches: false },
    }).bracket
    const { result } = renderHook(() => useTournamentActions('t1', 'org'))
    await act(async () => { await runToEnd(result.current.replaceSchedule.mutate({ ...schedule, bracket })) })
    const kinds = mockFake.requests.map(r => `${r.kind}:${r.name}:${r.wave}`)
    expect(kinds[0]).toBe('rpc:replace_tournament_schedule:0')
    // Three matches, each reffed by the third team: three ref updates in one wave.
    const refUpdates = mockFake.requests.filter(r => r.name === 'tournament_matches' && r.ops.includes('update'))
    expect(refUpdates).toHaveLength(3)
    expect(new Set(refUpdates.map(r => r.wave)).size).toBe(1)
    const inserts = mockFake.requests.filter(r => r.name === 'tournament_matches' && r.ops.includes('insert'))
    expect(inserts).toHaveLength(1)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('recording a result: sets replaced, match completed, winner advanced, then the status', async () => {
    mockFake.fixtures = { tournament_matches: [{ id: 'x' }], tournaments: [{ id: 't1' }], tournament_sets: [] }
    const { result } = renderHook(() => useTournamentActions('t1', 'org'))
    let outcome: unknown
    await act(async () => {
      outcome = await runToEnd(result.current.recordResult.mutate({
        matchId: 'm1', winnerId: 'a', forfeit: false,
        sets: [{ set_number: 1, team_a_score: 25, team_b_score: 20 }],
        writes: { advances: [{ matchId: 'm9', column: 'team_a_id', teamId: 'a' }], nextStatus: 'completed', podium: { first: 'a', second: 'b', thirds: [] }, blocked: null },
      }))
    })
    expect(outcome).toBe(true)
    const seq = mockFake.requests.map(r => `${r.name}:${r.ops.filter(o => ['delete', 'insert', 'update'].includes(o)).join(',')}`)
    expect(seq).toEqual([
      'tournament_sets:delete',
      'tournament_sets:insert',
      'tournament_matches:update',
      'tournament_matches:update',
      'tournaments:update',
    ])
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('seeding a bracket refuses when bracket results already exist', async () => {
    mockFake.fixtures = { tournament_matches: [{ id: 'played' }] }
    const { result } = renderHook(() => useTournamentActions('t1', 'org'))
    let outcome: unknown = 'unset'
    await act(async () => { outcome = await runToEnd(result.current.seedBracket.mutate([])) })
    expect(outcome).toBeUndefined()
    expect(mockNotify).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: expect.stringMatching(/already has results/) }))
    expect(mockFake.requests.some(r => r.ops.includes('delete'))).toBe(false)
  })
})
