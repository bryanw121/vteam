import { avoidPoolRematches, computeStandings, seedsFromPools, standingsPodium } from '../lib/tournamentStandings'
import { seedOrder } from '../lib/tournamentBracket'
import type { StandingMatch } from '../types'

/** A completed match; `sets` as [a, b] scores. */
function m(a: string, b: string, sets: [number, number][], status = 'completed'): StandingMatch {
  const aSets = sets.filter(([x, y]) => x > y).length
  const bSets = sets.filter(([x, y]) => y > x).length
  return {
    team_a_id: a, team_b_id: b, status,
    winner_id: aSets >= bSets ? a : b,
    sets: sets.map(([x, y], i) => ({ set_number: i + 1, team_a_score: x, team_b_score: y })),
  }
}

describe('computeStandings', () => {
  it('counts wins, sets and points; ignores unfinished matches and outsiders', () => {
    const rows = computeStandings(['a', 'b', 'c'], [
      m('a', 'b', [[25, 20], [25, 22]]),
      m('b', 'c', [[25, 10], [20, 25], [15, 12]]),
      { team_a_id: 'a', team_b_id: 'c', winner_id: null, status: 'scheduled', sets: [] },
      m('a', 'zz', [[25, 0], [25, 0]]),
    ])
    expect(rows.map(r => r.teamId)).toEqual(['a', 'b', 'c'])
    const [a, b, c] = rows
    expect(a).toMatchObject({ played: 1, wins: 1, losses: 0, setsWon: 2, setsLost: 0, pointsFor: 50, pointsAgainst: 42, rank: 1, tied: false })
    expect(b).toMatchObject({ played: 2, wins: 1, losses: 1, setsWon: 2, setsLost: 3, pointsFor: 102, pointsAgainst: 97, rank: 2 })
    expect(c).toMatchObject({ played: 1, wins: 0, losses: 1, rank: 3 })
  })

  it('head-to-head breaks a two-way tie before set ratio', () => {
    // a and b both 2-1; b beat a, but a has the better set ratio.
    const rows = computeStandings(['a', 'b', 'c', 'd'], [
      m('b', 'a', [[25, 23], [16, 25], [15, 13]]),
      m('a', 'c', [[25, 1], [25, 1]]),
      m('a', 'd', [[25, 1], [25, 1]]),
      m('b', 'c', [[25, 23], [23, 25], [15, 13]]),
      m('d', 'b', [[25, 20], [25, 20]]),
      m('c', 'd', [[25, 20], [25, 20]]),
    ])
    expect(rows.slice(0, 2).map(r => r.teamId)).toEqual(['b', 'a'])
    // Without head-to-head, set ratio puts a first.
    const noH2h = computeStandings(['a', 'b', 'c', 'd'], [
      m('b', 'a', [[25, 23], [16, 25], [15, 13]]),
      m('a', 'c', [[25, 1], [25, 1]]),
      m('a', 'd', [[25, 1], [25, 1]]),
      m('b', 'c', [[25, 23], [23, 25], [15, 13]]),
      m('d', 'b', [[25, 20], [25, 20]]),
      m('c', 'd', [[25, 20], [25, 20]]),
    ], ['set_ratio', 'point_diff'])
    expect(noH2h[0].teamId).toBe('a')
  })

  it('a three-way circle (each 1-1 among them) falls through to set ratio', () => {
    const rows = computeStandings(['a', 'b', 'c'], [
      m('a', 'b', [[25, 10], [25, 10]]),          // a 2-0
      m('b', 'c', [[25, 20], [20, 25], [15, 10]]), // b 2-1
      m('c', 'a', [[25, 20], [20, 25], [15, 10]]), // c 2-1
    ])
    // Sets: a 3-2 (.6), b 2-3 (.4), c 3-3... c: won 2 vs a, lost 1; vs b won 1 lost 2 -> 3-3 (.5)
    expect(rows.map(r => r.teamId)).toEqual(['a', 'c', 'b'])
    rows.forEach(r => expect(r.tied).toBe(false))
  })

  it('teams level on everything share a rank (tie for third)', () => {
    const rows = computeStandings(['a', 'b', 'c', 'd'], [
      m('a', 'c', [[25, 20], [25, 20]]),
      m('a', 'd', [[25, 20], [25, 20]]),
      m('b', 'c', [[25, 20], [25, 20]]),
      m('b', 'd', [[25, 20], [25, 20]]),
      m('a', 'b', [[25, 20], [25, 20]]),
    ])
    expect(rows.map(r => [r.teamId, r.rank, r.tied])).toEqual([['a', 1, false], ['b', 2, false], ['c', 3, true], ['d', 3, true]])
    expect(standingsPodium(rows)).toEqual({ first: 'a', second: 'b', thirds: ['c', 'd'] })
  })

  it('forfeits count as a win with no sets', () => {
    const rows = computeStandings(['a', 'b'], [{ team_a_id: 'a', team_b_id: 'b', winner_id: 'b', status: 'forfeit', sets: [] }])
    expect(rows[0]).toMatchObject({ teamId: 'b', wins: 1, setsWon: 0 })
  })

  it('no results yet: everyone tied at rank 1, in the given order', () => {
    const rows = computeStandings(['x', 'y', 'z'], [])
    expect(rows.map(r => [r.teamId, r.rank])).toEqual([['x', 1], ['y', 1], ['z', 1]])
  })

  it('podium from a short table', () => {
    expect(standingsPodium(computeStandings(['a', 'b'], [m('a', 'b', [[25, 1]])]))).toEqual({ first: 'a', second: 'b', thirds: [] })
  })
})

describe('seedsFromPools', () => {
  it('pool winners first (best record first), then runners-up', () => {
    const poolA = computeStandings(['a1', 'a2', 'a3'], [
      m('a1', 'a2', [[25, 1], [25, 1]]), m('a1', 'a3', [[25, 1], [25, 1]]), m('a2', 'a3', [[25, 1], [25, 1]]),
    ])
    const poolB = computeStandings(['b1', 'b2', 'b3'], [
      m('b1', 'b2', [[25, 23], [25, 23]]), m('b1', 'b3', [[25, 23], [23, 25], [15, 13]]), m('b2', 'b3', [[25, 1], [25, 1]]),
    ])
    expect(seedsFromPools([{ poolKey: 'B', rows: poolB }, { poolKey: 'A', rows: poolA }], 2)).toEqual(['a1', 'b1', 'b2', 'a2'])  // b2 and a2 both 1-1, 2-2 in sets; b2 has the better point difference
  })

  it('takes fewer from a pool that has fewer teams', () => {
    const p1 = computeStandings(['x'], [])
    const p2 = computeStandings(['y', 'z'], [m('y', 'z', [[25, 1]])])
    expect(seedsFromPools([{ poolKey: '1', rows: p1 }, { poolKey: '2', rows: p2 }], 2)).toEqual(['y', 'x', 'z'])
  })
})

describe('avoidPoolRematches', () => {
  const firstRound = (seeds: string[]) => {
    const order = seedOrder(seeds.length)
    const out: [string, string][] = []
    for (let i = 0; i < order.length; i += 2) out.push([seeds[order[i] - 1], seeds[order[i + 1] - 1]])
    return out
  }

  it('swaps same-tier teams so no first-round match repeats a pool game', () => {
    // 4 pools, top 2 advance. Seeds put A1 v A2 in round one (1 v 8).
    const seeds = ['A1', 'B1', 'C1', 'D1', 'D2', 'C2', 'B2', 'A2']
    const poolOf = new Map(seeds.map(s => [s, s[0]]))
    const tierOf = new Map(seeds.map(s => [s, Number(s[1])]))
    expect(firstRound(seeds).some(([x, y]) => x[0] === y[0])).toBe(true)
    const fixed = avoidPoolRematches(seeds, poolOf, tierOf)
    expect(firstRound(fixed).some(([x, y]) => x[0] === y[0])).toBe(false)
    // Winners stay in the top half of the seed list.
    expect(fixed.slice(0, 4).every(s => s.endsWith('1'))).toBe(true)
  })

  it('leaves seeds alone when nothing clashes', () => {
    const seeds = ['A1', 'B1', 'A2', 'B2']   // 1 v 4 = A1 v B2, 2 v 3 = B1 v A2
    const poolOf = new Map(seeds.map(s => [s, s[0]]))
    const tierOf = new Map(seeds.map(s => [s, Number(s[1])]))
    expect(avoidPoolRematches(seeds, poolOf, tierOf)).toEqual(seeds)
  })

  it('a single pool cannot avoid it and is returned unchanged', () => {
    const seeds = ['A1', 'A2', 'A3', 'A4']
    const poolOf = new Map(seeds.map(s => [s, 'A']))
    const tierOf = new Map(seeds.map((s, i) => [s, i]))
    expect(avoidPoolRematches(seeds, poolOf, tierOf)).toEqual(seeds)
  })
})
