import type { SheetState } from '../types'
import {
  bracketGroups, bracketRows, clockMinutes, isLosersBracket, liveMatches, parseSheetState, poolStandings, record, roundLabel, setsOf, sheetScoresUrl, teamDetail,
  teamList, upNext,
} from '../utils/sheetScores'

/** A trimmed copy of what the Sheet app's `?format=json` returns mid-bracket. */
const raw = {
  settings: { tournament_name: 'Texas Asian Olympics', divisions: ['Gold', 'Silver'], refresh_seconds: 10 },
  pools: { A: ['Aces', 'Blockers', 'Diggers'], B: ['Setters', 'Spikers'] },
  schedule: [
    { pool: 'A', game: '1', court: 1, time: '9:00 AM', a: 'Aces', b: 'Blockers' },
    { pool: 'A', game: '2', court: 2, time: '9:00 AM', a: 'Diggers', b: 'Aces' },
    { pool: 'A', game: '3', court: 1, time: '9:45 AM', a: 'Blockers', b: 'Diggers' },
  ],
  matches: [
    { match_id: 'A-1', stage: 'pool', group: 'A', court: 1, team_a: 'Blockers', team_b: 'Aces', s1_a: 25, s1_b: 21, s2_a: 20, s2_b: 25, status: 'final', winner: 'TIE' },
    { match_id: 'A-2', stage: 'pool', group: 'A', court: 2, team_a: 'Diggers', team_b: 'Aces', s1_a: 12, s1_b: 9, status: 'live' },
    { match_id: 'A-9', stage: 'pool', group: 'A', team_a: 'Diggers', team_b: 'Blockers', status: 'void' },
    { match_id: 'Gold-SF1', stage: 'bracket', group: 'Gold', round: 1, court: 3, team_a: 'Aces', team_b: 'Spikers', s1_a: 25, s1_b: 18, s2_a: 25, s2_b: 20, status: 'final', winner: 'Aces', format: 'bo3' },
    { match_id: 'Gold-SF2', stage: 'bracket', group: 'Gold', round: 1, court: 4, team_a: 'Setters', team_b: 'BYE', status: 'final', winner: 'Setters' },
    { match_id: 'Gold-F', stage: 'bracket', group: 'Gold', round: 2, court: 5, team_a: 'Aces', team_b: 'Setters', s1_a: 7, s1_b: 5, status: 'live' },
    { match_id: 'Gold-3rd place', stage: 'bracket', group: 'Gold', team_a: 'Spikers', status: 'scheduled' },
    { match_id: 'Side-1', stage: 'bracket', group: 'Side games', team_a: 'Blockers', team_b: 'Diggers', status: 'scheduled' },
  ],
  standings: {
    B: [{ pool: 'B', team: 'Setters', played: 1, wins: 1, losses: 0, sets_won: 2, sets_lost: 0, points_for: 50, points_against: 30, rank: 1 }],
    A: [
      { pool: 'A', team: 'Aces', played: 1, wins: 0, losses: 0, ties: 1, sets_won: 1, sets_lost: 1, points_for: 46, points_against: 45, rank: 1 },
      { pool: 'A', team: 'Blockers', played: 1, wins: 0, losses: 0, ties: 1, sets_won: 1, sets_lost: 1, points_for: 46, points_against: 45, rank: 1 },
      { pool: 'A', team: 'Diggers', played: 0, wins: 0, losses: 0, sets_won: 0, sets_lost: 0, points_for: 0, points_against: 0, rank: 3 },
    ],
  },
  seeds: [{ division: 'Gold', seed: 1, team: 'Aces' }],
  serverTime: '2026-11-14T18:00:00.000Z',
}
const state: SheetState = parseSheetState(raw)

describe('sheetExecUrl', () => {
  it('is null for tournaments vteam only reads, while their scores still load', () => {
    const { sheetExecUrl } = require('../utils/sheetScores')
    expect(sheetExecUrl('texasao-2026-11-14')).toBeNull()
    expect(sheetScoresUrl('texasao-2026-11-14')).toMatch(/format=json$/)
  })
})

describe('sheetScoresUrl', () => {
  it('is null for tournaments without a Sheet', () => {
    expect(sheetScoresUrl('nagva-2026-12-05')).toBeNull()
    expect(sheetScoresUrl(null)).toBeNull()
  })

  it('adds format=json to the configured /exec URL', () => {
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_TEXASAO_SCORES_URL = 'https://script.google.com/macros/s/abc/exec'
      const { sheetScoresUrl: fresh } = require('../utils/sheetScores')
      expect(fresh('texasao-2026-11-14')).toBe('https://script.google.com/macros/s/abc/exec?format=json')
      delete process.env.EXPO_PUBLIC_TEXASAO_SCORES_URL
    })
  })

  it('uses the deployed Sheet when no env var is set (web and native builds alike)', () => {
    jest.isolateModules(() => {
      delete process.env.EXPO_PUBLIC_TEXASAO_SCORES_URL
      const { sheetScoresUrl: fresh } = require('../utils/sheetScores')
      expect(fresh('texasao-2026-11-14')).toMatch(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\?format=json$/)
    })
  })
})

describe('parseSheetState', () => {
  it('rejects anything that is not the Sheet app state', () => {
    expect(() => parseSheetState({ hello: 'world' })).toThrow()
    expect(() => parseSheetState(null)).toThrow()
    expect(() => parseSheetState('<html>')).toThrow()
  })

  it('drops voided matches', () => {
    expect(state.matches.map(m => m.match_id)).not.toContain('A-9')
  })
})

describe('setsOf and roundLabel', () => {
  it('reads set scores in order and skips unplayed sets', () => {
    expect(setsOf(state.matches[0])).toEqual([{ a: 25, b: 21 }, { a: 20, b: 25 }])
    expect(setsOf({ match_id: 'x', stage: 'pool', status: 'live', s1_a: '3', s1_b: '' })).toEqual([{ a: 3, b: 0 }])
  })

  it('names rounds like the Sheet app', () => {
    expect(roundLabel({ match_id: 'Gold-QF2', group: 'Gold' })).toBe('Quarterfinal 2')
    expect(roundLabel({ match_id: 'Gold-F', group: 'Gold' })).toBe('Final')
    expect(roundLabel({ match_id: 'Silver-R16-3', group: 'Silver' })).toBe('Round of 16 #3')
    expect(roundLabel({ match_id: 'Gold-3rd place', group: 'Gold' })).toBe('3rd place')
    expect(roundLabel({ match_id: 'Gold-L2-3', group: 'Gold' })).toBe('Losers round 2 #3')
    expect(roundLabel({ match_id: 'Gold-L5', group: 'Gold' })).toBe('Losers round 5')
    expect(roundLabel({ match_id: 'Gold-WF', group: 'Gold' })).toBe('Winners final')
    expect(roundLabel({ match_id: 'Gold-LF', group: 'Gold' })).toBe('Losers final')
    expect(roundLabel({ match_id: 'Gold-GF', group: 'Gold' })).toBe('Grand final')
    expect(roundLabel({ match_id: 'Gold-GF2', group: 'Gold' })).toBe('Grand final (game 2)')
  })
})

describe('liveMatches and upNext', () => {
  it('lists games in play by court, with a label for where they belong', () => {
    expect(liveMatches(state)).toEqual([
      { id: 'A-2', court: 2, label: 'Pool A', teamA: 'Diggers', teamB: 'Aces', sets: [{ a: 12, b: 9 }] },
      { id: 'Gold-F', court: 5, label: 'Gold · Final', teamA: 'Aces', teamB: 'Setters', sets: [{ a: 7, b: 5 }] },
    ])
  })

  it('leaves the court out when the scorekeeper set none, and lists that game last', () => {
    const noCourt = parseSheetState({ ...raw, matches: [...raw.matches, { match_id: 'B-1', stage: 'pool', group: 'B', team_a: 'Setters', team_b: 'Spikers', s1_a: 3, s1_b: 4, status: 'live' }] })
    const last = liveMatches(noCourt).at(-1)
    expect(last).toMatchObject({ id: 'B-1', court: null, label: 'Pool B' })
  })

  it('leaves out scheduled games already started, whichever side each team is on', () => {
    expect(upNext(state).map(g => g.game)).toEqual(['3'])
  })
})

describe('poolStandings', () => {
  it('maps every pool, in pool order, and marks shared ranks as tied', () => {
    const pools = poolStandings(state)
    expect(pools.map(p => p.name)).toEqual(['Pool A', 'Pool B'])
    expect(pools[0].rows.map(r => [r.teamId, r.rank, r.tied])).toEqual([['Aces', 1, true], ['Blockers', 1, true], ['Diggers', 3, false]])
    expect(pools[0].rows[0]).toMatchObject({ ties: 1, setsWon: 1, setsLost: 1, pointsFor: 46, pointsAgainst: 45 })
  })
})

describe('brackets', () => {
  it('orders divisions by Settings, then other groups', () => {
    expect(bracketGroups(state)).toEqual(['Gold', 'Side games'])
  })

  it('turns a division into BracketView rows with round names, winners and a last "Other games" column', () => {
    const rows = bracketRows(state, 'Gold')
    const byId = Object.fromEntries(rows.map(r => [r.id, r]))
    expect(byId['Gold-SF1']).toMatchObject({ round: 1, match_number: 1, bracket_round_name: 'Semifinal', winner_id: 'Aces', court: 'Court 3' })
    expect(byId['Gold-SF1'].sets).toEqual([
      { set_number: 1, team_a_score: 25, team_b_score: 18 },
      { set_number: 2, team_a_score: 25, team_b_score: 20 },
    ])
    expect(byId['Gold-SF2']).toMatchObject({ team_b_id: null, winner_id: 'Setters' })
    expect(byId['Gold-F']).toMatchObject({ round: 2, bracket_round_name: 'Final', winner_id: null, court: 'Court 5', status: 'in_progress' })
    expect(byId['Gold-3rd place'].court).toBeNull()
    expect(byId['Gold-3rd place']).toMatchObject({ round: 3, bracket_round_name: 'Other games', team_b_id: null })
  })
})

describe('teams', () => {
  it('lists every team A–Z and filters by name, any case', () => {
    expect(teamList(state).map(t => t.team)).toEqual(['Aces', 'Blockers', 'Diggers', 'Setters'])
    expect(teamList(state, 'ers').map(t => t.team)).toEqual(['Blockers', 'Diggers', 'Setters'])
    expect(teamList(state, ' ACES ').map(t => t.team)).toEqual(['Aces'])
  })

  it('writes ties only when there are some', () => {
    expect(record({ wins: 0, losses: 0, ties: 1 })).toBe('0-0-1')
    expect(record({ wins: 3, losses: 1 })).toBe('3-1')
  })

  it("builds a team's page: standing, seed, and games from its side, pool first, then bracket, then up next", () => {
    const aces = teamDetail(state, 'Aces')!
    expect(aces).toMatchObject({ name: 'Aces', poolSize: 3, seed: { division: 'Gold', seed: 1 } })
    expect(aces.games.map(g => [g.id, g.status, g.result, g.opponent, g.detail])).toEqual([
      ['A-1', 'final', 'T', 'Blockers', '21–25, 25–20'],
      ['A-2', 'live', null, 'Diggers', '9–12'],
      ['Gold-SF1', 'final', 'W', 'Spikers', '25–18, 25–20'],
      ['Gold-F', 'live', null, 'Setters', '7–5'],
    ])
    expect(aces.games[2].label).toBe('Gold · Semifinal 1')
  })

  it('adds scheduled pool games not started yet, with court and time, and marks byes', () => {
    expect(teamDetail(state, 'Diggers')!.games.at(-1)).toMatchObject({ status: 'upcoming', opponent: 'Blockers', label: 'Pool A', detail: 'Court 1 · 9:45 AM' })
    expect(teamDetail(state, 'Setters')!.games.find(g => g.id === 'Gold-SF2')).toMatchObject({ opponent: null, bye: true, result: 'W' })
    expect(teamDetail(state, 'Spikers')).toBeNull() // in a bracket but not in the standings fixture
    expect(teamDetail(state, 'Aces')!.games.every(g => !g.bye)).toBe(true)
    expect(teamDetail(state, 'Nobody')).toBeNull()
  })
})

describe('double elimination (Texas AO Sunday)', () => {
  const day2 = parseSheetState({
    settings: { divisions: ['Gold'] },
    standings: { A: [{ pool: 'A', team: 'Aces', played: 4, wins: 4, losses: 0, sets_won: 8, sets_lost: 0, points_for: 200, points_against: 150, rank: 1 }] },
    matches: [
      { match_id: 'Gold-QF1', stage: 'bracket', group: 'Gold', round: 1, court: 1, time: '11:00 AM', team_a: 'Aces', team_b: 'Blockers', status: 'final', winner: 'Blockers', s1_a: 20, s1_b: 25, s2_a: 21, s2_b: 25, next_match: 'Gold-SF1', loser_match: 'Gold-L1-1' },
      { match_id: 'Gold-SF1', stage: 'bracket', group: 'Gold', round: 2, court: 5, time: '12:00 PM', team_a: 'Blockers', status: 'scheduled', ref: 'Aces', ref_team: 'Aces' },
      { match_id: 'Gold-L1-1', stage: 'bracket', group: 'Gold', round: 1, court: 1, time: '12:30 PM', team_a: 'Aces', status: 'scheduled' },
      { match_id: 'Gold-GF2', stage: 'bracket', group: 'Gold', round: 5, court: 1, time: '5:30 PM', status: 'void' },
    ],
  })

  it('reads clock times', () => {
    expect(clockMinutes('11:00 AM')).toBe(660)
    expect(clockMinutes('12:30 PM')).toBe(750)
    expect(clockMinutes(undefined)).toBeNull()
  })

  it('puts losers-bracket games under the losers bracket and shows the planned time before a game starts', () => {
    expect(isLosersBracket({ match_id: 'Gold-L1-1', group: 'Gold' })).toBe(true)
    expect(isLosersBracket({ match_id: 'Gold-LF', group: 'Gold' })).toBe(true)
    expect(isLosersBracket({ match_id: 'Gold-GF', group: 'Gold' })).toBe(false)
    const byId = Object.fromEntries(bracketRows(day2, 'Gold').map(r => [r.id, r]))
    expect(byId['Gold-L1-1']).toMatchObject({ is_losers_bracket: true, bracket_round_name: 'Losers round 1', court: '12:30 PM · Court 1' })
    expect(byId['Gold-SF1']).toMatchObject({ is_losers_bracket: false, court: '12:00 PM · Court 5' })
    expect(byId['Gold-QF1'].court).toBe('Court 1')
    expect(byId['Gold-GF2']).toBeUndefined() // a void reset game is dropped
  })

  it("lists a team's bracket games by time, with its ref duty", () => {
    const aces = teamDetail(day2, 'Aces')!
    expect(aces.games.map(g => [g.id, g.status, g.label, g.detail])).toEqual([
      ['Gold-QF1', 'final', 'Gold · Quarterfinal 1', '20–25, 21–25'],
      ['Gold-L1-1', 'upcoming', 'Gold · Losers round 1 #1', '12:30 PM · Court 1'],
      ['ref-Gold-SF1', 'upcoming', 'Ref · Gold · Semifinal 1', '12:00 PM · Court 5'],
    ])
    expect(aces.games[2].ref).toBe(true)
  })
})
