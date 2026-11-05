import { isTournamentDecided, parseSets, poolTables, resultWrites, tournamentPodium, winnerFromSets } from '../lib/tournamentResults'
import { generateBracket } from '../lib/tournamentBracket'
import { splitTournaments } from '../utils/tournamentList'
import type { Tournament, TournamentListItem, TournamentMatchRow } from '../types'

const T = (over: Partial<Pick<Tournament, 'format' | 'bracket_type' | 'status'>> = {}) =>
  ({ format: 'bracket', bracket_type: 'single', status: 'published', ...over }) as Pick<Tournament, 'format' | 'bracket_type' | 'status'>

function bracketMatches(n: number, type: 'single' | 'double' = 'single', thirdPlace = false): TournamentMatchRow[] {
  return generateBracket(Array.from({ length: n }, (_, i) => `s${i + 1}`), type, thirdPlace).map((g, i) => ({
    id: `m${i}`, tournament_id: 't', pool_id: null, stage: 'bracket', round: g.round, match_number: g.match_number,
    team_a_id: g.team_a_id, team_b_id: g.team_b_id, court: null, scheduled_at: null, status: 'scheduled', winner_id: null,
    bracket_round_name: g.bracket_round_name, is_losers_bracket: g.is_losers_bracket, ref_team_id: null, sets: [],
  }))
}

function poolMatch(id: string, poolId: string, a: string, b: string, winner: string | null): TournamentMatchRow {
  return {
    id, tournament_id: 't', pool_id: poolId, stage: 'pool_play', round: 1, match_number: 1, team_a_id: a, team_b_id: b,
    court: null, scheduled_at: null, status: winner ? 'completed' : 'scheduled', winner_id: winner,
    bracket_round_name: null, is_losers_bracket: false, ref_team_id: null, sets: [],
  }
}

/** Apply writes the way recordResult does. */
function apply(matches: TournamentMatchRow[], matchId: string, winnerId: string, writes: ReturnType<typeof resultWrites>) {
  return matches.map(m => {
    let row = m.id === matchId ? { ...m, winner_id: winnerId, status: 'completed' as const } : m
    for (const a of writes.advances) if (a.matchId === m.id) row = { ...row, [a.column]: a.teamId }
    return row
  })
}

describe('parseSets / winnerFromSets', () => {
  it('skips blank rows and numbers sets in order', () => {
    expect(parseSets([{ a: '25', b: '20' }, { a: '', b: '' }, { a: '18', b: '25' }])).toEqual({
      sets: [
        { set_number: 1, team_a_score: 25, team_b_score: 20 },
        { set_number: 2, team_a_score: 18, team_b_score: 25 },
      ],
      error: null,
    })
  })

  it('rejects half-filled rows, non-numbers and ties', () => {
    expect(parseSets([{ a: '25', b: '' }]).error).toMatch(/Set 1/)
    expect(parseSets([{ a: 'x', b: '3' }]).error).toMatch(/whole numbers/)
    expect(parseSets([{ a: '25', b: '25' }]).error).toMatch(/tie/)
  })

  it('winner = more sets won', () => {
    const s = (a: number, b: number, n: number) => ({ set_number: n, team_a_score: a, team_b_score: b })
    expect(winnerFromSets([s(25, 20, 1), s(20, 25, 2), s(15, 10, 3)])).toBe('a')
    expect(winnerFromSets([s(20, 25, 1)])).toBe('b')
    expect(winnerFromSets([s(25, 20, 1), s(20, 25, 2)])).toBeNull()
    expect(winnerFromSets([])).toBeNull()
  })
})

describe('resultWrites', () => {
  it('a semifinal winner moves into the final; first result starts the tournament', () => {
    const matches = bracketMatches(4)
    const semi = matches.find(m => m.round === 1 && m.match_number === 1) as TournamentMatchRow
    const w = resultWrites({ match: semi, winnerId: 's1', matches, tournament: T() })
    const final = matches.find(m => m.round === 2) as TournamentMatchRow
    expect(w).toEqual({ advances: [{ matchId: final.id, column: 'team_a_id', teamId: 's1' }], nextStatus: 'in_progress', podium: null, blocked: null })
  })

  it('recording the final completes the tournament (points PR #100 keys off this)', () => {
    let matches = bracketMatches(4)
    const tournament = T({ status: 'in_progress' })
    for (const m of matches.filter(x => x.round === 1)) {
      const w = resultWrites({ match: m, winnerId: m.team_a_id as string, matches, tournament })
      matches = apply(matches, m.id, m.team_a_id as string, w)
    }
    const final = matches.find(m => m.round === 2) as TournamentMatchRow
    expect(final.team_a_id && final.team_b_id).toBeTruthy()
    const w = resultWrites({ match: final, winnerId: final.team_b_id as string, matches, tournament })
    expect(w.nextStatus).toBe('completed')
    expect(w.podium).toEqual({ first: 's2', second: 's1', thirds: ['s4', 's3'] })
    const after = apply(matches, final.id, final.team_b_id as string, w)
    expect(isTournamentDecided(after, tournament)).toBe(true)
    expect(tournamentPodium(after, tournament, [])).toEqual({ first: 's2', second: 's1', thirds: ['s4', 's3'] })
  })

  it('with a third-place match, the final alone does not complete it', () => {
    let matches = bracketMatches(4, 'single', true)
    const tournament = T({ status: 'in_progress' })
    for (const m of matches.filter(x => x.round === 1)) matches = apply(matches, m.id, m.team_a_id as string, resultWrites({ match: m, winnerId: m.team_a_id as string, matches, tournament }))
    const final = matches.find(m => m.round === 2 && m.match_number === 1) as TournamentMatchRow
    const tp = matches.find(m => m.round === 2 && m.match_number === 2) as TournamentMatchRow
    expect([tp.team_a_id, tp.team_b_id]).toEqual(['s4', 's3'])
    const wFinal = resultWrites({ match: final, winnerId: 's1', matches, tournament })
    expect(wFinal.nextStatus).toBeNull()
    matches = apply(matches, final.id, 's1', wFinal)
    expect(resultWrites({ match: tp, winnerId: 's3', matches, tournament }).nextStatus).toBe('completed')
  })

  it('double elimination: the loser drops into the losers bracket', () => {
    const matches = bracketMatches(4, 'double')
    const w1 = matches.find(m => !m.is_losers_bracket && m.round === 1 && m.match_number === 1) as TournamentMatchRow
    const w = resultWrites({ match: w1, winnerId: 's1', matches, tournament: T({ bracket_type: 'double' }) })
    const lb = matches.find(m => m.is_losers_bracket && m.round === 1) as TournamentMatchRow
    expect(w.advances).toContainEqual({ matchId: lb.id, column: 'team_a_id', teamId: 's4' })
  })

  it('refuses to change a result whose next match is already played', () => {
    let matches = bracketMatches(4)
    const tournament = T({ status: 'in_progress' })
    for (const m of matches.filter(x => x.round === 1)) matches = apply(matches, m.id, m.team_a_id as string, resultWrites({ match: m, winnerId: m.team_a_id as string, matches, tournament }))
    const final = matches.find(m => m.round === 2) as TournamentMatchRow
    matches = apply(matches, final.id, 's1', resultWrites({ match: final, winnerId: 's1', matches, tournament }))
    const semi = matches.find(m => m.round === 1 && m.match_number === 1) as TournamentMatchRow
    expect(resultWrites({ match: semi, winnerId: 's4', matches, tournament }).blocked).toMatch(/already been played/)
    // Re-recording the same winner is fine.
    expect(resultWrites({ match: semi, winnerId: 's1', matches, tournament }).blocked).toBeNull()
  })

  it('rejects a winner who is not in the match', () => {
    const matches = bracketMatches(4)
    expect(resultWrites({ match: matches[0], winnerId: 'nobody', matches, tournament: T() }).blocked).toBeTruthy()
  })

  it('round robin: completes when the last match is in', () => {
    const tournament = T({ format: 'round_robin', status: 'in_progress' })
    const matches = [poolMatch('a', 'p', 'x', 'y', 'x'), poolMatch('b', 'p', 'y', 'z', null)].map(m => ({ ...m, stage: 'round_robin' as const, pool_id: null }))
    expect(resultWrites({ match: matches[1], winnerId: 'y', matches, tournament }).nextStatus).toBe('completed')
  })

  it('pool + bracket: pool play alone never completes it', () => {
    const tournament = T({ format: 'pool_bracket', status: 'in_progress' })
    const matches = [poolMatch('a', 'p', 'x', 'y', null)]
    expect(resultWrites({ match: matches[0], winnerId: 'x', matches, tournament }).nextStatus).toBeNull()
  })

  it('a completed tournament stays completed (no status write) when a result is corrected', () => {
    const matches = bracketMatches(2)
    expect(resultWrites({ match: matches[0], winnerId: 's2', matches, tournament: T({ status: 'completed' }) }).nextStatus).toBeNull()
  })
})

describe('poolTables / podium', () => {
  it('ranks each pool from its own matches, in pool order', () => {
    const pools = [
      { id: 'pB', name: 'Pool B', display_order: 1, team_ids: ['b1', 'b2'] },
      { id: 'pA', name: 'Pool A', display_order: 0, team_ids: ['a1', 'a2'] },
    ]
    const tables = poolTables(pools, [poolMatch('1', 'pA', 'a1', 'a2', 'a2'), poolMatch('2', 'pB', 'b1', 'b2', 'b1')])
    expect(tables.map(t => [t.name, t.rows.map(r => r.teamId)])).toEqual([['Pool A', ['a2', 'a1']], ['Pool B', ['b1', 'b2']]])
  })

  it('round-robin podium from the table, null until every match is in', () => {
    const tournament = T({ format: 'round_robin' })
    const ms = [poolMatch('1', 'p', 'x', 'y', 'x'), poolMatch('2', 'p', 'y', 'z', 'y'), poolMatch('3', 'p', 'x', 'z', null)].map(m => ({ ...m, stage: 'round_robin' as const }))
    expect(tournamentPodium(ms, tournament, ['x', 'y', 'z'])).toBeNull()
    ms[2] = { ...ms[2], winner_id: 'x', status: 'completed' }
    expect(tournamentPodium(ms, tournament, ['x', 'y', 'z'])).toEqual({ first: 'x', second: 'y', thirds: ['z'] })
  })
})

describe('splitTournaments', () => {
  const item = (id: string, start: string, status: TournamentListItem['status']): TournamentListItem => ({
    id, title: id, location: null, start_date: start, status, format: 'bracket', club_id: 'c', max_teams: null, club_name: null, team_count: 0,
  })
  it('upcoming soonest first, past latest first; finished ones are past even if dated ahead', () => {
    const now = new Date('2026-10-28T12:00:00')
    const { upcoming, past } = splitTournaments([
      item('later', '2026-11-10T15:00:00', 'published'),
      item('today', '2026-10-28T08:00:00', 'published'),
      item('live', '2026-10-27T15:00:00', 'in_progress'),
      item('old', '2026-09-01T15:00:00', 'completed'),
      item('stale', '2026-10-01T15:00:00', 'published'),
      item('cancelled', '2026-12-01T15:00:00', 'cancelled'),
    ], now)
    expect(upcoming.map(t => t.id)).toEqual(['live', 'today', 'later'])
    expect(past.map(t => t.id)).toEqual(['cancelled', 'stale', 'old'])
  })
})
