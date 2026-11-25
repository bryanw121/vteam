import { addPinGroup, cleanPins, drawSoloTeams, postSoloTeamsArgs, removePinGroup, soloTeamCount, soloTeamLevel, soloTeamSizes } from '../utils/soloTeams'
import type { BalancePlayer, VolleyballSkillLevel } from '../types'

/** A seeded random so draws are repeatable. */
function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 1103515245 + 12345) % 2 ** 31; return s / 2 ** 31 }
}

const LEVELS: VolleyballSkillLevel[] = ['d', 'c', 'b', 'bb', 'a', 'aa_plus']
const roster = (n: number, opts: { setters?: number; levels?: boolean } = {}): BalancePlayer[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    skillLevel: opts.levels === false ? null : LEVELS[i % LEVELS.length],
    isSetter: i < (opts.setters ?? 0),
  }))

const sizes = (teams: { members: string[] }[]) => teams.map(t => t.members.length)

describe('team counts and sizes', () => {
  it('rounds to the nearest number of teams, at least two', () => {
    expect(soloTeamCount(24, 6)).toBe(4)
    expect(soloTeamCount(25, 6)).toBe(4)
    expect(soloTeamCount(27, 6)).toBe(5)
    expect(soloTeamCount(3, 6)).toBe(2)
    expect(soloTeamCount(1, 6)).toBe(0)
  })

  it('spreads the extra players one per team', () => {
    expect(soloTeamSizes(25, 4)).toEqual([7, 6, 6, 6])
    expect(soloTeamSizes(27, 5)).toEqual([6, 6, 5, 5, 5])
  })
})

describe('pins', () => {
  it('drops players who left, duplicates and groups of one', () => {
    expect(cleanPins([['a', 'b'], ['b', 'c', 'x'], ['d'], 'junk', [['e']]], ['a', 'b', 'c', 'd'])).toEqual([['a', 'b']])
    expect(cleanPins(null, ['a'])).toEqual([])
  })

  it('moves players into a new group and drops what that empties', () => {
    expect(addPinGroup([['a', 'b'], ['c', 'd']], ['b', 'c'])).toEqual([['b', 'c']])
    expect(addPinGroup([['a', 'b', 'e']], ['b', 'c'])).toEqual([['a', 'e'], ['b', 'c']])
    expect(removePinGroup([['a', 'b'], ['c', 'd']], 0)).toEqual([['c', 'd']])
  })
})

describe('drawSoloTeams', () => {
  it('puts every player on exactly one team, sizes within one of each other', () => {
    for (const mode of ['random', 'balanced'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const players = roster(25, { setters: 3 })
        const teams = drawSoloTeams(players, { size: 6, pins: [], mode, random: seeded(seed) })
        expect(teams).toHaveLength(4)
        expect(teams.flatMap(t => t.members).sort()).toEqual(players.map(p => p.id).sort())
        expect(sizes(teams).sort()).toEqual([6, 6, 6, 7])
        teams.forEach((t, i) => { expect(t.name).toBe(`Team ${i + 1}`); expect(t.captain).toBe(t.members[0]) })
      }
    }
  })

  it('keeps pinned friends on one team', () => {
    const pins = [['p0', 'p1', 'p2'], ['p5', 'p9']]
    for (const mode of ['random', 'balanced'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const teams = drawSoloTeams(roster(24), { size: 6, pins, mode, random: seeded(seed) })
        for (const g of pins) expect(new Set(g.map(id => teams.findIndex(t => t.members.includes(id)))).size).toBe(1)
        expect(sizes(teams)).toEqual([6, 6, 6, 6])
      }
    }
  })

  it('balanced: setters on different teams and averages close', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const players = roster(24, { setters: 4 })
      const teams = drawSoloTeams(players, { size: 6, pins: [], mode: 'balanced', random: seeded(seed) })
      const setters = teams.map(t => t.members.filter(id => players.find(p => p.id === id)!.isSetter).length)
      expect(setters).toEqual([1, 1, 1, 1])
      const pts = { d: 1, c: 2, b: 3, bb: 4, a: 5, aa_plus: 6 }
      const avgs = teams.map(t => t.members.reduce((a, id) => a + pts[players.find(p => p.id === id)!.skillLevel!], 0) / t.members.length)
      expect(Math.max(...avgs) - Math.min(...avgs)).toBeLessThanOrEqual(0.5)
    }
  })

  it('balanced with no levels is an even split', () => {
    const teams = drawSoloTeams(roster(12, { levels: false }), { size: 6, pins: [], mode: 'balanced', random: seeded(3) })
    expect(sizes(teams)).toEqual([6, 6])
  })

  it('draws nothing for fewer than two players', () => {
    expect(drawSoloTeams(roster(1), { size: 6, pins: [], mode: 'random' })).toEqual([])
  })
})

describe('soloTeamLevel and postSoloTeamsArgs', () => {
  it('averages a team when half has a level', () => {
    const players: BalancePlayer[] = [
      { id: 'a', skillLevel: 'b', isSetter: false }, { id: 'b', skillLevel: 'a', isSetter: false }, { id: 'c', skillLevel: null, isSetter: false },
    ]
    expect(soloTeamLevel(['a', 'b', 'c'], players)).toBe('bb')
    expect(soloTeamLevel(['a', 'c', 'x'], players)).toBeNull()
  })

  it('sends non-empty teams with their captain', () => {
    expect(postSoloTeamsArgs('t1', [{ name: 'Team 1', members: ['a', 'b'], captain: 'a' }, { name: 'Team 2', members: [], captain: null }]))
      .toEqual({ p_tournament_id: 't1', p_teams: [{ name: 'Team 1', captain: 'a', members: ['a', 'b'] }] })
  })
})
