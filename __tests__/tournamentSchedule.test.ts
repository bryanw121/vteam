import {
  assignPools, generateSchedule, nextStageStart, packRoundRobin, pairKey, poolLayout, roundRobinRounds, scheduleBracket,
  seededOrder, shuffle,
} from '../lib/tournamentSchedule'
import { generateBracket } from '../lib/tournamentBracket'
import type { PackedMatch, RoundRobinGroup, ScheduleConfig, ScheduleInput } from '../types'

const START = new Date('2026-11-01T15:00:00.000Z')
const BASE_CONFIG: ScheduleConfig = { numCourts: 1, matchDuration: 45, breakDuration: 10, gamesPerTeam: null, teamsPerPool: null, restBetweenMatches: false }

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`)

/** Small deterministic PRNG so pool dealing is reproducible. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function input(over: Partial<ScheduleInput> & { teamIds: string[] }): ScheduleInput {
  return { format: 'round_robin', startDate: START, config: BASE_CONFIG, random: seeded(7), ...over }
}

function gamesPlayed(matches: { team_a_id: string | null; team_b_id: string | null }[]) {
  const counts = new Map<string, number>()
  for (const m of matches) {
    for (const t of [m.team_a_id, m.team_b_id]) if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return counts
}

function group(teamIds: string[], poolKey: string | null = null): RoundRobinGroup {
  return { poolKey, teamIds, rounds: roundRobinRounds(teamIds) }
}

/** Per team, the slots it plays in, sorted. */
function playSlots(packed: PackedMatch[]) {
  const out = new Map<string, number[]>()
  for (const m of packed) for (const t of [m.teamA, m.teamB]) out.set(t, [...(out.get(t) ?? []), m.slot])
  out.forEach(v => v.sort((a, b) => a - b))
  return out
}

function backToBacks(packed: PackedMatch[]): number {
  let n = 0
  for (const slots of playSlots(packed).values()) for (let i = 1; i < slots.length; i++) if (slots[i] === slots[i - 1] + 1) n++
  return n
}

function assertSlotInvariants(packed: PackedMatch[], numCourts: number) {
  const bySlot = new Map<number, PackedMatch[]>()
  packed.forEach(m => bySlot.set(m.slot, [...(bySlot.get(m.slot) ?? []), m]))
  for (const list of bySlot.values()) {
    expect(list.length).toBeLessThanOrEqual(numCourts)
    const players = list.flatMap(m => [m.teamA, m.teamB])
    expect(new Set(players).size).toBe(players.length)
    const refs = list.map(m => m.refTeamId).filter((r): r is string => !!r)
    expect(new Set(refs).size).toBe(refs.length)
    refs.forEach(r => expect(players).not.toContain(r))
    expect(new Set(list.map(m => m.court)).size).toBe(list.length)
  }
}

describe('poolLayout', () => {
  it.each([
    [2, 1, 2],
    [4, 1, 4],
    [5, 1, 5],
    [6, 2, 3],
    [8, 2, 4],
    [9, 2, 5],
    [10, 3, 4],
    [12, 3, 4],
  ])('%i teams -> %i pool(s) of up to %i', (n, numPools, teamsPerPool) => {
    expect(poolLayout(n)).toEqual({ numPools, teamsPerPool })
  })

  it.each([
    [12, 3, 4, 3],
    [12, 6, 2, 6],
    [10, 3, 4, 3],
    [7, 5, 2, 4],
  ])('%i teams with pools of %i -> %i pools of up to %i', (n, size, numPools, teamsPerPool) => {
    expect(poolLayout(n, size)).toEqual({ numPools, teamsPerPool })
  })

  it('has no pools for no teams', () => {
    expect(poolLayout(0)).toEqual({ numPools: 0, teamsPerPool: 0 })
  })
})

describe('shuffle / pairKey / seededOrder', () => {
  it('shuffle returns a permutation without touching the input', () => {
    const src = ids(8)
    const out = shuffle(src, seeded(3))
    expect([...out].sort()).toEqual([...src].sort())
    expect(src).toEqual(ids(8))
  })

  it('pairKey ignores order', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'))
  })

  it('seededOrder: seeds first by seed, then unseeded in list order', () => {
    expect(seededOrder([
      { id: 'a', seed: null }, { id: 'b', seed: 2 }, { id: 'c', seed: null }, { id: 'd', seed: 1 },
    ])).toEqual(['d', 'b', 'a', 'c'])
  })
})

describe('assignPools', () => {
  const seededTeams = (n: number) => ids(n).map((id, i) => ({ id, seed: i + 1 }))

  it('snake-deals seeds so each pool gets one of the top seeds', () => {
    const pools = assignPools({ teams: seededTeams(8), numPools: 2 })
    expect(pools).toEqual([['t1', 't4', 't5', 't8'], ['t2', 't3', 't6', 't7']])
  })

  it('three pools of four: seeds 1-3 head different pools, seed sums are balanced', () => {
    const pools = assignPools({ teams: seededTeams(12), numPools: 3 })
    expect(pools.map(p => p[0]).sort()).toEqual(['t1', 't2', 't3'])
    const sums = pools.map(p => p.reduce((s, id) => s + Number(id.slice(1)), 0))
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(3)
  })

  it('pool sizes differ by at most one and every team lands once', () => {
    for (const [n, k] of [[9, 2], [10, 3], [11, 4], [7, 3]] as const) {
      const pools = assignPools({ teams: ids(n).map(id => ({ id, seed: null })), numPools: k, random: seeded(n) })
      const sizes = pools.map(p => p.length)
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
      expect(pools.flat().sort()).toEqual(ids(n).sort())
    }
  })

  it('never makes more pools than teams', () => {
    expect(assignPools({ teams: seededTeams(2), numPools: 5 })).toHaveLength(2)
  })

  it('keeps "avoid" pairs apart by swapping same-tier teams', () => {
    // Snake puts t1 and t4 together; ask to keep them apart.
    const avoid = new Map([[pairKey('t1', 't4'), 5]])
    const pools = assignPools({ teams: seededTeams(8), numPools: 2, avoid })
    const together = pools.some(p => p.includes('t1') && p.includes('t4'))
    expect(together).toBe(false)
    // Seed tiers are preserved: each pool still has exactly one of t1/t2.
    pools.forEach(p => expect(p.filter(id => id === 't1' || id === 't2')).toHaveLength(1))
  })

  it('minimizes total avoid weight when not every pair can be separated', () => {
    // Three teams that all want to avoid each other, two pools: at best one pair shares.
    const teams = ids(4).map(id => ({ id, seed: null }))
    const avoid = new Map([[pairKey('t1', 't2'), 1], [pairKey('t1', 't3'), 1], [pairKey('t2', 't3'), 1]])
    const pools = assignPools({ teams, numPools: 2, random: seeded(5), avoid })
    let shared = 0
    for (const p of pools) for (const [k] of avoid) { const [a, b] = k.split('|'); if (p.includes(a) && p.includes(b)) shared++ }
    expect(shared).toBe(1)
  })
})

describe('roundRobinRounds', () => {
  it('has no rounds for fewer than two teams', () => {
    expect(roundRobinRounds([])).toEqual([])
    expect(roundRobinRounds(['solo'])).toEqual([])
  })

  it('even field: n-1 rounds, everyone plays every round, every pair meets once', () => {
    const rounds = roundRobinRounds(ids(6))
    expect(rounds).toHaveLength(5)
    const seen = new Set<string>()
    for (const round of rounds) {
      expect(round).toHaveLength(3)
      expect(new Set(round.flat()).size).toBe(6)
      for (const [a, b] of round) {
        expect(seen.has(pairKey(a, b))).toBe(false)
        seen.add(pairKey(a, b))
      }
    }
    expect(seen.size).toBe(15)
  })

  it('odd field: n rounds, exactly one bye per team, every pair meets once', () => {
    const teams = ids(5)
    const rounds = roundRobinRounds(teams)
    expect(rounds).toHaveLength(5)
    const byes = new Map<string, number>()
    const seen = new Set<string>()
    for (const round of rounds) {
      expect(round).toHaveLength(2)
      const playing = new Set(round.flat())
      teams.filter(t => !playing.has(t)).forEach(t => byes.set(t, (byes.get(t) ?? 0) + 1))
      round.forEach(([a, b]) => seen.add(pairKey(a, b)))
    }
    expect(seen.size).toBe(10)
    teams.forEach(t => expect(byes.get(t)).toBe(1))
  })
})

describe('packRoundRobin', () => {
  it('4 teams on one court: 6 slots, nobody plays three in a row', () => {
    // Every slot uses half the field, so some back-to-backs are unavoidable here.
    const packed = packRoundRobin([group(ids(4))], { numCourts: 1, refs: false })
    expect(packed).toHaveLength(6)
    expect(Math.max(...packed.map(m => m.slot))).toBe(5)
    for (const slots of playSlots(packed).values()) {
      for (let i = 2; i < slots.length; i++) expect(slots[i] - slots[i - 2]).toBeGreaterThan(2)
    }
    assertSlotInvariants(packed, 1)
  })

  it('5 teams on one court: the packer finds an order with no back-to-backs', () => {
    const g = group(ids(5))
    const naive: PackedMatch[] = g.rounds.flat().map(([a, b], slot) => ({ poolKey: null, round: 0, teamA: a, teamB: b, slot, court: 0, refTeamId: null }))
    expect(backToBacks(naive)).toBeGreaterThan(0)
    expect(backToBacks(packRoundRobin([g], { numCourts: 1, refs: false }))).toBe(0)
  })

  it('6 teams on one court: every team gets a break between matches', () => {
    const packed = packRoundRobin([group(ids(6))], { numCourts: 1, refs: false })
    expect(packed).toHaveLength(15)
    expect(backToBacks(packed)).toBe(0)
  })

  describe('guaranteed rest', () => {
    it('8 teams on 2 courts: no back-to-backs, at the cost of a few more slots', () => {
      const compact = packRoundRobin([group(ids(8))], { numCourts: 2, refs: false })
      const rested = packRoundRobin([group(ids(8))], { numCourts: 2, refs: false, rest: true })
      expect(backToBacks(compact)).toBeGreaterThan(0)
      expect(backToBacks(rested)).toBe(0)
      expect(rested).toHaveLength(28)
      expect(new Set(rested.map(m => m.slot)).size).toBeGreaterThan(new Set(compact.map(m => m.slot)).size)
      assertSlotInvariants(rested, 2)
    })

    it('still finishes when rest is impossible (4 teams, 2 courts)', () => {
      const rested = packRoundRobin([group(ids(4))], { numCourts: 2, refs: false, rest: true })
      expect(rested).toHaveLength(6)
      expect(new Set(rested.map(m => m.slot)).size).toBe(3)
    })

    it('flows through generateSchedule', () => {
      const config = { ...BASE_CONFIG, numCourts: 2, restBetweenMatches: true }
      const { matches } = generateSchedule(input({ teamIds: ids(8), config }))
      const slotsOf = new Map<string, number[]>()
      matches.forEach(m => [m.team_a_id, m.team_b_id].forEach(t => slotsOf.set(t, [...(slotsOf.get(t) ?? []), m.round])))
      for (const rounds of slotsOf.values()) {
        rounds.sort((a, b) => a - b)
        for (let i = 1; i < rounds.length; i++) expect(rounds[i] - rounds[i - 1]).toBeGreaterThan(1)
      }
    })
  })

  it('fills every court when it can: 8 teams on 4 courts takes 7 slots', () => {
    const packed = packRoundRobin([group(ids(8))], { numCourts: 4, refs: false })
    expect(packed).toHaveLength(28)
    expect(new Set(packed.map(m => m.slot)).size).toBe(7)
    assertSlotInvariants(packed, 4)
  })

  it('two pools share the courts and never double-book a team', () => {
    const packed = packRoundRobin([group(['a1', 'a2', 'a3', 'a4'], 'A'), group(['b1', 'b2', 'b3', 'b4'], 'B')], { numCourts: 2, refs: true })
    expect(packed).toHaveLength(12)
    assertSlotInvariants(packed, 2)
  })

  describe('ref duty', () => {
    it('three teams: the team sitting out refs every match', () => {
      const packed = packRoundRobin([group(['a', 'b', 'c'])], { numCourts: 1, refs: true })
      for (const m of packed) {
        expect(m.refTeamId).not.toBeNull()
        expect(['a', 'b', 'c'].filter(t => t !== m.teamA && t !== m.teamB)).toEqual([m.refTeamId])
      }
    })

    it('refs come from the same pool when possible', () => {
      const packed = packRoundRobin([group(['a1', 'a2', 'a3'], 'A'), group(['b1', 'b2', 'b3'], 'B')], { numCourts: 2, refs: true })
      for (const m of packed) expect(m.refTeamId?.[0]).toBe(m.teamA[0])
    })

    it('duties are spread evenly (within one) in a single pool', () => {
      const packed = packRoundRobin([group(ids(4))], { numCourts: 1, refs: true })
      const duties = new Map<string, number>()
      packed.forEach(m => m.refTeamId && duties.set(m.refTeamId, (duties.get(m.refTeamId) ?? 0) + 1))
      const counts = ids(4).map(t => duties.get(t) ?? 0)
      expect(counts.reduce((a, b) => a + b, 0)).toBe(6)
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
      assertSlotInvariants(packed, 1)
    })

    it('two teams: nobody is free to ref', () => {
      const packed = packRoundRobin([group(['a', 'b'])], { numCourts: 1, refs: true })
      expect(packed[0].refTeamId).toBeNull()
    })

    it('refs off: no referee assigned', () => {
      const packed = packRoundRobin([group(ids(5))], { numCourts: 1, refs: false })
      packed.forEach(m => expect(m.refTeamId).toBeNull())
    })

    it('busy courts: as many refs as there are idle teams (8 teams, 3 courts)', () => {
      const packed = packRoundRobin([group(ids(8))], { numCourts: 3, refs: true })
      assertSlotInvariants(packed, 3)
      const bySlot = new Map<number, PackedMatch[]>()
      packed.forEach(m => bySlot.set(m.slot, [...(bySlot.get(m.slot) ?? []), m]))
      for (const list of bySlot.values()) {
        const idle = 8 - list.length * 2
        expect(list.filter(m => m.refTeamId).length).toBe(Math.min(list.length, idle))
      }
    })
  })
})

describe('generateSchedule', () => {
  it('returns nothing for fewer than two teams', () => {
    expect(generateSchedule(input({ teamIds: ['a'] }))).toEqual({ pools: [], matches: [], bracket: [] })
    expect(generateSchedule(input({ teamIds: [] }))).toEqual({ pools: [], matches: [], bracket: [] })
  })

  describe('round robin (no pools)', () => {
    it('schedules every pair once, one slot per match on one court', () => {
      const { pools, matches } = generateSchedule(input({ teamIds: ids(4) }))
      expect(pools).toEqual([])
      expect(matches).toHaveLength(6)
      matches.forEach(m => {
        expect(m.stage).toBe('round_robin')
        expect(m.pool_key).toBeNull()
        expect(m.court).toBe('Main Court')
        expect(m.status).toBe('scheduled')
        expect(m.ref_team_id).toBeNull()
      })
      expect(new Set(matches.map(m => pairKey(m.team_a_id, m.team_b_id))).size).toBe(6)
      // slot = 45 min match + 10 min break
      const offsets = matches.map(m => (new Date(m.scheduled_at).getTime() - START.getTime()) / 60_000)
      expect(offsets).toEqual([0, 55, 110, 165, 220, 275])
    })

    it('match numbers run 1..n and (round, match_number) is chronological', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(7), config: { ...BASE_CONFIG, numCourts: 2 } }))
      expect(matches.map(m => m.match_number)).toEqual(matches.map((_, i) => i + 1))
      const sorted = [...matches].sort((a, b) => a.round - b.round || a.match_number - b.match_number)
      const times = sorted.map(m => new Date(m.scheduled_at).getTime())
      expect(times).toEqual([...times].sort((a, b) => a - b))
    })

    it('odd team count on two courts: everyone plays everyone, nobody twice at once', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(5), config: { ...BASE_CONFIG, numCourts: 2 } }))
      expect(matches).toHaveLength(10)
      ids(5).forEach(t => expect(gamesPlayed(matches).get(t)).toBe(4))
      const bySlot = new Map<string, string[]>()
      matches.forEach(m => bySlot.set(m.scheduled_at, [...(bySlot.get(m.scheduled_at) ?? []), m.team_a_id, m.team_b_id]))
      bySlot.forEach(teams => expect(new Set(teams).size).toBe(teams.length))
    })

    it('treats a nonsensical court count as one court', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(4), config: { ...BASE_CONFIG, numCourts: 0 } }))
      expect(new Set(matches.map(m => m.court))).toEqual(new Set(['Main Court']))
    })

    it('refs on: every match has a referee who is not playing', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(5), refs: true }))
      matches.forEach(m => {
        expect(m.ref_team_id).not.toBeNull()
        expect([m.team_a_id, m.team_b_id]).not.toContain(m.ref_team_id)
      })
    })
  })

  describe('bracket-only format', () => {
    it('builds an elimination bracket from seeds, without shuffling', () => {
      const random = jest.fn(() => 0.5)
      const out = generateSchedule(input({ format: 'bracket', teamIds: ['a', 'b', 'c', 'd'], seeds: { d: 1 }, random }))
      expect(random).not.toHaveBeenCalled()
      expect(out.pools).toEqual([])
      expect(out.matches).toEqual([])
      // Seeds: d (1), a, b, c (registration order) -> 1 v 4 = d v c, 2 v 3 = a v b.
      const first = out.bracket.filter(m => m.round === 1).map(m => [m.team_a_id, m.team_b_id])
      expect(first).toEqual([['d', 'c'], ['a', 'b']])
      expect(out.bracket.find(m => m.round === 2)?.bracket_round_name).toBe('Final')
    })

    it('double elimination when asked', () => {
      const out = generateSchedule(input({ format: 'bracket', teamIds: ids(4), bracketType: 'double' }))
      expect(out.bracket).toHaveLength(6)
      expect(out.bracket.some(m => m.is_losers_bracket)).toBe(true)
    })
  })

  describe('pool play', () => {
    it('9 teams: pools of 5 and 4, each team in exactly one pool, all pool pairs once', () => {
      const { pools, matches, bracket } = generateSchedule(input({ format: 'pool_play', teamIds: ids(9) }))
      expect(bracket).toEqual([])
      expect(pools.map(p => p.name)).toEqual(['Pool A', 'Pool B'])
      expect(pools.map(p => p.team_ids.length).sort()).toEqual([4, 5])
      expect(pools.flatMap(p => p.team_ids).sort()).toEqual(ids(9).sort())
      matches.forEach(m => expect(m.stage).toBe('pool_play'))
      for (const pool of pools) {
        const own = matches.filter(m => m.pool_key === pool.key)
        const n = pool.team_ids.length
        expect(own).toHaveLength((n * (n - 1)) / 2)
        own.forEach(m => {
          expect(pool.team_ids).toContain(m.team_a_id)
          expect(pool.team_ids).toContain(m.team_b_id)
        })
      }
    })

    it('honours a chosen pool size', () => {
      const { pools } = generateSchedule(input({ format: 'pool_bracket', teamIds: ids(12), config: { ...BASE_CONFIG, teamsPerPool: 3 } }))
      expect(pools.map(p => p.team_ids.length)).toEqual([3, 3, 3, 3])
    })

    it('uses seeds to spread the top teams across pools', () => {
      const seeds = { t5: 1, t6: 2 }
      const { pools } = generateSchedule(input({ format: 'pool_play', teamIds: ids(8), seeds }))
      expect(pools[0].team_ids[0]).toBe('t5')
      expect(pools[1].team_ids[0]).toBe('t6')
    })

    it('is reproducible with the same random source', () => {
      const a = generateSchedule(input({ format: 'pool_play', teamIds: ids(9), random: seeded(11) }))
      const b = generateSchedule(input({ format: 'pool_play', teamIds: ids(9), random: seeded(11) }))
      expect(a).toEqual(b)
    })

    it('different draws can deal different pools', () => {
      const a = generateSchedule(input({ format: 'pool_play', teamIds: ids(8), random: seeded(1) }))
      const b = generateSchedule(input({ format: 'pool_play', teamIds: ids(8), random: seeded(99) }))
      expect(a.pools.map(p => p.team_ids)).not.toEqual(b.pools.map(p => p.team_ids))
    })
  })

  describe('games per team cap', () => {
    it('even field: every team plays exactly the cap', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(6), config: { ...BASE_CONFIG, gamesPerTeam: 2 } }))
      expect(matches).toHaveLength(6)
      ids(6).forEach(t => expect(gamesPlayed(matches).get(t)).toBe(2))
      expect(new Set(matches.map(m => pairKey(m.team_a_id, m.team_b_id))).size).toBe(6)
    })

    it('odd field: nobody exceeds the cap and nobody is more than one game short', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(5), config: { ...BASE_CONFIG, gamesPerTeam: 3 } }))
      ids(5).forEach(t => {
        expect(gamesPlayed(matches).get(t)).toBeLessThanOrEqual(3)
        expect(gamesPlayed(matches).get(t)).toBeGreaterThanOrEqual(2)
      })
    })

    it('a cap above what is possible gives the full round robin', () => {
      const { matches } = generateSchedule(input({ teamIds: ids(4), config: { ...BASE_CONFIG, gamesPerTeam: 5 } }))
      expect(matches).toHaveLength(6)
    })
  })
})

describe('scheduleBracket / nextStageStart', () => {
  it('plays waves in order, filling courts, one slot per court-load', () => {
    const rows = generateBracket(ids(8))
    const timed = scheduleBracket(rows, START, { ...BASE_CONFIG, numCourts: 2 })
    const offsets = (round: number) => timed.filter(m => m.round === round).map(m => (new Date(m.scheduled_at).getTime() - START.getTime()) / 60_000)
    expect(offsets(1)).toEqual([0, 0, 55, 55])
    expect(offsets(2)).toEqual([110, 110])
    expect(offsets(3)).toEqual([165])
    expect(timed.filter(m => m.round === 1).map(m => m.court)).toEqual(['Court 1', 'Court 2', 'Court 1', 'Court 2'])
  })

  it('a bye winner does not wait for a match that is not played', () => {
    const rows = generateBracket(ids(3))   // seed 1 has a bye into the final
    const timed = scheduleBracket(rows, START, BASE_CONFIG)
    expect(timed.map(m => m.bracket_round_name)).toEqual(['Semifinal', 'Final'])
    expect(new Date(timed[1].scheduled_at).getTime() - START.getTime()).toBe(55 * 60_000)
  })

  it('next stage starts one slot after the last match', () => {
    const t = nextStageStart(['2026-11-01T15:00:00.000Z', '2026-11-01T16:00:00.000Z', null], BASE_CONFIG, START)
    expect(t.toISOString()).toBe('2026-11-01T16:55:00.000Z')
    expect(nextStageStart([], BASE_CONFIG, START)).toBe(START)
  })
})
