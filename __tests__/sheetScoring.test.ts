import type { SheetMatch, SheetSetPair, SheetState } from '../types'
import {
  activeSet, addPoint, formatFor, keepGames, keepGroups, matchDecided, maxSets, setDone, setTarget, setsFromMatch, setsPayload,
} from '../utils/sheetScoring'

const rules: SheetState['settings'] = { pool_format: '2sets', bracket_format: 'bo3', set_target: 25, deciding_set_target: 15, point_cap: 30, divisions: ['Gold', 'Silver'] }
const noCap = { ...rules, point_cap: null }

describe('formats and targets (same as the Sheet app)', () => {
  it("uses the match's own format, else the pool or bracket default", () => {
    expect(formatFor({ stage: 'pool' }, rules)).toBe('2sets')
    expect(formatFor({ stage: 'bracket' }, rules)).toBe('bo3')
    expect(formatFor({ stage: 'bracket', format: 'BO5' }, rules)).toBe('bo5')
    expect(formatFor({ stage: 'bracket', format: 'nonsense' }, rules)).toBe('bo3')
    expect([maxSets('1set'), maxSets('2sets'), maxSets('bo3'), maxSets('bo5')]).toEqual([1, 2, 3, 5])
  })

  it('plays the last set of a best-of to the deciding target', () => {
    expect([0, 1, 2].map(i => setTarget(i, 'bo3', rules))).toEqual([25, 25, 15])
    expect([0, 1].map(i => setTarget(i, '2sets', rules))).toEqual([25, 25])
    expect(setTarget(4, 'bo5', rules)).toBe(15)
  })

  it('ends a set at the target with a 2-point lead, or at the cap', () => {
    expect(setDone(25, 23, 25, null)).toBe(true)
    expect(setDone(25, 24, 25, null)).toBe(false)
    expect(setDone(29, 27, 25, 30)).toBe(true)
    expect(setDone(30, 29, 25, 30)).toBe(true) // cap: no 2-point lead needed
    expect(setDone(29, 28, 25, 30)).toBe(false)
    expect(setDone(15, 13, 15, null)).toBe(true)
    expect(setDone(null, 3, 25, null)).toBe(false)
  })
})

describe('match progress', () => {
  it('knows when a match is decided: 2 sets in 2sets (ties too), 2 wins in bo3', () => {
    expect(matchDecided([[25, 20], [20, 25]], '2sets', rules)).toBe(true)
    expect(matchDecided([[25, 20], [10, 8]], '2sets', rules)).toBe(false)
    expect(matchDecided([[25, 20], [25, 18], [null, null]], 'bo3', rules)).toBe(true)
    expect(matchDecided([[25, 20], [18, 25], [10, 8]], 'bo3', rules)).toBe(false)
    expect(matchDecided([[25, 20], [18, 25], [15, 12]], 'bo3', rules)).toBe(true)
  })

  it('moves to the next set once one is won, and stays when the match is decided', () => {
    const sets: SheetSetPair[] = [[25, 20], [null, null], [null, null]]
    expect(activeSet(sets, 'bo3', noCap)).toBe(1)
    expect(activeSet([[25, 20], [25, 18], [null, null]], 'bo3', noCap)).toBe(1)
    expect(activeSet([[12, 9], [null, null]], '2sets', noCap)).toBe(0)
    expect(activeSet([[null, null], [null, null]], '2sets', noCap)).toBe(0)
  })

  it('adds and takes back points in one set, never below zero', () => {
    const sets: SheetSetPair[] = [[25, 20], [null, null]]
    expect(addPoint(sets, 1, 0, 1)).toEqual([[25, 20], [1, 0]])
    expect(addPoint(addPoint(sets, 1, 1, 1), 1, 1, -1)).toEqual([[25, 20], [0, 0]])
    expect(addPoint(sets, 1, 0, -1)).toEqual([[25, 20], [0, 0]])
    expect(sets).toEqual([[25, 20], [null, null]]) // not changed in place
  })

  it('reads a match row into set pairs and writes them back the way submitScore takes them', () => {
    const m = { match_id: 'A-1', stage: 'pool', status: 'live', s1_a: 25, s1_b: 21, s2_a: 3, s2_b: '' } as SheetMatch
    const sets = setsFromMatch(m, '2sets')
    expect(sets).toEqual([[25, 21], [3, null]])
    expect(setsPayload(sets)).toEqual([[25, 21], [3, '']])
  })
})

describe('what a scorekeeper can pick', () => {
  const state: SheetState = {
    settings: rules,
    pools: { B: ['Setters', 'Spikers', 'Aces'], A: ['Diggers', 'Blockers'] },
    schedule: [
      { pool: 'B', game: '1', court: 2, time: '9:00 AM', a: 'Setters', b: 'Spikers' },
      { pool: 'B', game: '2', court: 3, time: '9:45 AM', a: 'Aces', b: 'Setters' },
    ],
    matches: [
      { match_id: 'B-1', stage: 'pool', group: 'B', court: 2, team_a: 'Spikers', team_b: 'Setters', status: 'live' },
      { match_id: 'Gold-SF1', stage: 'bracket', group: 'Gold', round: 1, team_a: 'Aces', team_b: 'Spikers', status: 'scheduled' },
      { match_id: 'Gold-SF2', stage: 'bracket', group: 'Gold', round: 1, team_a: 'Setters', team_b: 'BYE', status: 'final', winner: 'Setters' },
      { match_id: 'Gold-F', stage: 'bracket', group: 'Gold', round: 2, team_a: 'Setters', status: 'scheduled' },
    ],
    standings: {},
    seeds: [],
  }

  it('offers pools A–Z, then divisions with bracket games', () => {
    expect(keepGroups(state).map(g => g.label)).toEqual(['Pool A', 'Pool B', 'Gold'])
  })

  it('lists a pool: games in play, then scheduled ones not started (with court), skipping the started pairing', () => {
    expect(keepGames(state, 'pool:B').map(g => [g.status, g.matchId, g.teamA, g.teamB, g.court])).toEqual([
      ['live', 'B-1', 'Spikers', 'Setters', 2],
      ['scheduled', null, 'Aces', 'Setters', 3],
    ])
    expect(keepGames(state, 'pool:B')[1].label).toBe('Pool B · Game 2 · 9:45 AM')
  })

  it('lists a bracket: only games with both teams known, never byes', () => {
    expect(keepGames(state, 'bracket:Gold').map(g => [g.matchId, g.status, g.label])).toEqual([
      ['Gold-SF1', 'scheduled', 'Gold · Semifinal 1'],
    ])
  })
})
