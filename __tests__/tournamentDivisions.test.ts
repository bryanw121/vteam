import { defaultDivisions, divisionProblem, divisionSizes, finishesOut, seedDivisions } from '../lib/tournamentDivisions'
import { canPlayExactly, partialRoundRobinRounds, roundRobinRounds } from '../lib/tournamentSchedule'
import { computeStandings, isTie } from '../lib/tournamentStandings'
import type { StandingMatch, StandingRow } from '../types'

const ids = (n: number, prefix = 't') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

describe('defaultDivisions', () => {
  it('splits 7 pool finishes into the Texas AO divisions', () => {
    expect(defaultDivisions(4, 7).map(d => [d.name, d.fromPlace, d.toPlace])).toEqual([
      ['Platinum', 1, 1], ['Gold', 2, 3], ['Silver', 4, 5], ['Bronze', 6, 7],
    ])
  })
  it('one division takes the top half; the rest are out after pools', () => {
    const one = defaultDivisions(1, 7)
    expect(one).toEqual([{ key: 'd1', name: 'Championship', fromPlace: 1, toPlace: 4 }])
    expect(finishesOut(one, 7)).toEqual({ fromPlace: 5, toPlace: 7 })
    expect(finishesOut(defaultDivisions(2, 7), 7)).toBeNull()
  })
  it('never makes more divisions than a pool has finishes', () => {
    expect(defaultDivisions(5, 3)).toHaveLength(3)
    for (const n of [1, 2, 3, 4, 5, 6]) {
      for (const per of [3, 4, 5, 6, 7, 9]) expect(divisionProblem(defaultDivisions(n, per), per)).toEqual({ kind: 'none' })
    }
  })
})

describe('divisionProblem', () => {
  const gold = { key: 'g', name: 'Gold', fromPlace: 1, toPlace: 2 }
  it('names what is wrong', () => {
    expect(divisionProblem([gold, { key: 's', name: 'Silver', fromPlace: 2, toPlace: 4 }], 6)).toEqual({ kind: 'overlap', key: 's', place: 2 })
    expect(divisionProblem([gold, { key: 's', name: 'Silver', fromPlace: 4, toPlace: 5 }], 6)).toEqual({ kind: 'gap', place: 3 })
    expect(divisionProblem([gold, { key: 's', name: 'Silver', fromPlace: 3, toPlace: 7 }], 6)).toEqual({ kind: 'out_of_range', key: 's', place: 7 })
    expect(divisionProblem([{ ...gold, name: ' ' }], 6)).toEqual({ kind: 'unnamed', key: 'g' })
    expect(divisionProblem([{ ...gold, toPlace: 0 }], 6)).toEqual({ kind: 'empty', key: 'g' })
  })
})

describe('divisionSizes', () => {
  it('gives the Texas AO bracket sizes: 8 / 16 / 16 / 16, no byes', () => {
    expect(divisionSizes(defaultDivisions(4, 7), new Array(8).fill(7)).map(s => [s.teams, s.byes])).toEqual([[8, 0], [16, 0], [16, 0], [16, 0]])
  })
  it('counts byes, and a short pool sends fewer teams', () => {
    // Pools of 7, 7 and 6: the 7th-place slot is empty in the short pool.
    const sizes = divisionSizes(defaultDivisions(2, 7), [7, 7, 6])
    expect(sizes).toEqual([
      { key: 'd1', teams: 9, bracketSize: 16, byes: 7 },
      { key: 'd2', teams: 11, bracketSize: 16, byes: 5 },
    ])
  })
})

describe('seedDivisions', () => {
  const row = (teamId: string, wins: number, played = 4): StandingRow => ({
    teamId, played, wins, losses: played - wins, setsWon: wins * 2, setsLost: (played - wins) * 2, pointsFor: 100, pointsAgainst: 100, rank: 1, tied: false,
  })
  it('seeds each division by pool finish, best record first within a finish', () => {
    const pools = [
      { poolKey: 'A', rows: [row('a1', 3), row('a2', 2), row('a3', 1)] },
      { poolKey: 'B', rows: [row('b1', 4), row('b2', 3), row('b3', 0)] },
    ]
    const [top, rest] = seedDivisions(pools, [
      { key: 'g', name: 'Gold', fromPlace: 1, toPlace: 1 },
      { key: 's', name: 'Silver', fromPlace: 2, toPlace: 3 },
    ])
    expect(top.seeds).toEqual(['b1', 'a1'])
    expect(rest.seeds).toEqual(['b2', 'a2', 'a3', 'b3'])
    expect(rest.placeOf.get('a3')).toBe(3)
  })
})

describe('partialRoundRobinRounds', () => {
  function check(n: number, k: number, expected = k) {
    const rounds = partialRoundRobinRounds(ids(n), k)
    const played = new Map<string, number>()
    const pairs = new Set<string>()
    for (const round of rounds) {
      const inRound = new Set<string>()
      for (const [a, b] of round) {
        expect(a).not.toBe(b)
        expect(inRound.has(a) || inRound.has(b)).toBe(false)
        inRound.add(a); inRound.add(b)
        const key = [a, b].sort().join('|')
        expect(pairs.has(key)).toBe(false)
        pairs.add(key)
        played.set(a, (played.get(a) ?? 0) + 1)
        played.set(b, (played.get(b) ?? 0) + 1)
      }
    }
    for (const id of ids(n)) expect(played.get(id)).toBe(expected)
    return rounds
  }
  it('Texas AO pools: 7 teams, 4 matches each, 14 matches', () => {
    const rounds = check(7, 4)
    expect(rounds.flat()).toHaveLength(14)
  })
  it('works for every pool size and match count that can be exact', () => {
    for (let n = 3; n <= 12; n++) {
      for (let k = 1; k < n - 1; k++) if (canPlayExactly(n, k)) check(n, k)
    }
  })
  it('odd teams with an odd count play one more each', () => {
    check(7, 3, 4)
  })
  it('is the full round robin when everyone plays everyone', () => {
    expect(partialRoundRobinRounds(ids(5), 4)).toEqual(roundRobinRounds(ids(5)))
    expect(partialRoundRobinRounds(ids(5), 9)).toEqual(roundRobinRounds(ids(5)))
  })
})

describe('standings with tied matches (two-set pool play)', () => {
  const m = (a: string, b: string, sets: [number, number][], winner: string | null): StandingMatch => ({
    team_a_id: a, team_b_id: b, winner_id: winner, status: 'completed',
    sets: sets.map(([x, y], i) => ({ set_number: i + 1, team_a_score: x, team_b_score: y })),
  })
  it('a 1–1 split is a tie worth half a win', () => {
    const split = m('a', 'b', [[25, 20], [18, 25]], null)
    expect(isTie(split)).toBe(true)
    const rows = computeStandings(['a', 'b', 'c'], [
      split,
      m('a', 'c', [[25, 10], [25, 12]], 'a'),
      m('b', 'c', [[25, 23], [20, 25]], null),
    ])
    // a: 1 win + 1 tie (1.5); b: 2 ties (1.0); c: 1 tie + 1 loss (0.5)
    expect(rows.map(r => [r.teamId, r.wins, r.ties, r.losses])).toEqual([['a', 1, 1, 0], ['b', 0, 2, 0], ['c', 0, 1, 1]])
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3])
  })
  it('tables without ties look exactly as before', () => {
    const rows = computeStandings(['a', 'b'], [m('a', 'b', [[25, 20], [25, 20]], 'a')])
    expect(rows[0]).not.toHaveProperty('ties')
    expect(isTie(m('a', 'b', [], null))).toBe(false)
  })
})
