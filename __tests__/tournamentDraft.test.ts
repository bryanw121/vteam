/**
 * #325: the tournament wizard's pure rules (utils/tournamentDraft) and the
 * save, which is one save_tournament call.
 */
import {
  DEFAULT_TOURNAMENT_DRAFT, firstInvalidStep, formatHasBracket, formatHasPools, moveItem, newTournamentDraft,
  saveTournamentArgs, validateTournamentStep, sortTournamentClubs, draftFromTournament, updateTournamentArgs, tournamentPlayers,
} from '../utils/tournamentDraft'
import { DEFAULT_TIEBREAKERS } from '../lib/tournamentStandings'
import type { Tournament, TournamentDraft, TournamentRules, TournamentTeamWithRoster } from '../types'

const mockRpc = jest.fn()
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }))

const ready = (patch: Partial<TournamentDraft> = {}): TournamentDraft => ({
  ...newTournamentDraft(),
  title: '  Summer Slam ',
  clubIds: ['club-1'],
  startDate: new Date('2026-12-05T15:00:42.123Z'),
  ...patch,
})

describe('tournament draft rules', () => {
  it('a fresh draft never shares its tiebreaker list with the defaults', () => {
    const a = newTournamentDraft()
    a.tiebreakers.reverse()
    expect(newTournamentDraft().tiebreakers).toEqual([...DEFAULT_TIEBREAKERS, 'sets_won'])
    expect(DEFAULT_TOURNAMENT_DRAFT.tiebreakers).toEqual([...DEFAULT_TIEBREAKERS, 'sets_won'])
  })

  it('step 1 needs a name and a start date; clubs are optional (#401)', () => {
    expect(validateTournamentStep(0, newTournamentDraft())).toBe('Please enter a tournament name.')
    expect(validateTournamentStep(0, ready({ title: '   ' }))).toBe('Please enter a tournament name.')
    expect(validateTournamentStep(0, ready({ clubIds: [] }))).toBeNull()
    expect(validateTournamentStep(0, ready({ startDate: null }))).toBe('Please set a start date.')
    expect(validateTournamentStep(0, ready())).toBeNull()
  })

  it('step 3 keeps the roster sizes in order; other steps have nothing to check', () => {
    expect(validateTournamentStep(2, ready({ minRosterSize: 11, maxRosterSize: 10 }))).toBe('Min roster cannot exceed max.')
    expect(validateTournamentStep(2, ready())).toBeNull()
    expect(validateTournamentStep(1, newTournamentDraft())).toBeNull()
    expect(validateTournamentStep(3, newTournamentDraft())).toBeNull()
  })

  it('saving checks every step, not only the one on screen', () => {
    expect(firstInvalidStep(ready())).toBeNull()
    expect(firstInvalidStep(ready({ minRosterSize: 12 }))).toEqual({ step: 2, message: 'Min roster cannot exceed max.' })
    expect(firstInvalidStep(ready({ title: '' }))?.step).toBe(0)
  })

  it('knows which formats have a bracket and pools', () => {
    expect(['pool_bracket', 'bracket', 'pool_play', 'round_robin'].map(f => formatHasBracket(f as never))).toEqual([true, true, false, false])
    expect(['pool_bracket', 'bracket', 'pool_play', 'round_robin'].map(f => formatHasPools(f as never))).toEqual([true, false, true, false])
  })

  it('moves a tiebreaker up and down, never off the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
  })
})

describe('saveTournamentArgs', () => {
  it('sends trimmed text, minute-precision dates and the rules', () => {
    const args = saveTournamentArgs(ready({ description: '  ', location: ' Gym ' }), 'published')
    expect(args.p_tournament).toMatchObject({
      club_id: 'club-1', title: 'Summer Slam', description: null, location: 'Gym', status: 'published',
      start_date: '2026-12-05T15:00:00.000Z', registration_deadline: null, format: 'pool_bracket', bracket_type: 'single',
    })
    expect(args.p_tournament).not.toHaveProperty('created_by')
    expect(args.p_rules).toEqual({
      starting_score: 0, winning_score: 25, deciding_set_score: 15, win_by_margin: 2, point_cap: null, sets_to_win: 2,
      tiebreakers: [...DEFAULT_TIEBREAKERS, 'sets_won'], third_place_match: false, phase_rules: {},
    })
  })

  it('has no bracket type without a bracket, and Venmo only when there is a fee', () => {
    expect(saveTournamentArgs(ready({ format: 'pool_play' }), 'draft').p_tournament.bracket_type).toBeNull()
    expect(saveTournamentArgs(ready({ venmoHandle: 'me' }), 'draft').p_tournament.venmo_handle).toBeNull()
    expect(saveTournamentArgs(ready({ price: 20, venmoHandle: ' me ' }), 'draft').p_tournament.venmo_handle).toBe('me')
  })

  it('captains by default; solo sends the team size, no team cap and rosters around it (#282)', () => {
    expect(saveTournamentArgs(ready({ maxTeams: 8 }), 'draft').p_tournament).toMatchObject({ team_mode: 'captains', team_size: null, max_teams: 8, min_roster_size: 6, max_roster_size: 10 })
    expect(saveTournamentArgs(ready({ teamMode: 'solo', teamSize: 4, maxTeams: 8 }), 'draft').p_tournament)
      .toMatchObject({ team_mode: 'solo', team_size: 4, max_teams: null, min_roster_size: 3, max_roster_size: 5 })
  })

  it('checks the team size in solo and the roster only with captains', () => {
    expect(validateTournamentStep(2, ready({ teamMode: 'solo', minRosterSize: 11, maxRosterSize: 10 }))).toBeNull()
    expect(validateTournamentStep(2, ready({ teamMode: 'solo', teamSize: 1 }))).toBe('Teams need 2 to 9 players.')
  })

  it('plays a third-place match only in a single-elimination bracket', () => {
    const third = (patch: Partial<TournamentDraft>) => saveTournamentArgs(ready({ thirdPlaceMatch: true, ...patch }), 'draft').p_rules.third_place_match
    expect(third({})).toBe(true)
    expect(third({ bracketType: 'double' })).toBe(false)
    expect(third({ format: 'pool_play' })).toBe(false)
  })
})

describe('saveTournament', () => {
  beforeEach(() => mockRpc.mockReset())

  it('is one save_tournament call that hands back the id', async () => {
    const { saveTournament } = require('../hooks/tournament/useSaveTournament') as typeof import('../hooks/tournament/useSaveTournament')
    mockRpc.mockResolvedValue({ data: 't-1', error: null })
    await expect(saveTournament({ draft: ready(), status: 'draft' })).resolves.toBe('t-1')
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('save_tournament', saveTournamentArgs(ready(), 'draft'))
  })

  it('throws the server error (nothing was written)', async () => {
    const { saveTournament } = require('../hooks/tournament/useSaveTournament') as typeof import('../hooks/tournament/useSaveTournament')
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'save_tournament: not a member of that club' } })
    await expect(saveTournament({ draft: ready(), status: 'published' })).rejects.toMatchObject({ code: '42501' })
  })
})

describe('clubs (#401)', () => {
  it('saves no club, or every linked club with the first as club_id', () => {
    expect(saveTournamentArgs(ready({ clubIds: [] }), 'draft').p_tournament).toMatchObject({ club_id: null, club_ids: [] })
    expect(saveTournamentArgs(ready({ clubIds: ['a', 'b'] }), 'draft').p_tournament).toMatchObject({ club_id: 'a', club_ids: ['a', 'b'] })
  })

  it('lists clubs the player runs first', () => {
    const sorted = sortTournamentClubs([
      { id: '1', name: 'Zeta', role: 'owner' }, { id: '2', name: 'Alpha', role: 'member' }, { id: '3', name: 'Beta', role: 'admin' },
    ])
    expect(sorted.map(c => c.name)).toEqual(['Beta', 'Zeta', 'Alpha'])
  })
})

describe('editing (#402)', () => {
  const tournament = {
    id: 't1', club_id: 'c1', created_by: 'host', title: 'Fall Slam', description: 'Bring water', location: 'Gym',
    skill_levels: ['open', 'a'], start_date: '2026-12-05T15:00:00.000Z', registration_deadline: '2026-12-01T05:00:00.000Z',
    status: 'published', format: 'pool_bracket', bracket_type: 'double', max_teams: 12, min_roster_size: 6, max_roster_size: 9,
    teams_advance_per_pool: 0, has_refs: true, price: 20, venmo_handle: '@host', team_mode: 'captains', team_size: null,
  } as unknown as Tournament
  const rules = {
    tournament_id: 't1', starting_score: 4, winning_score: 25, deciding_set_score: 15, win_by_margin: 2, point_cap: null,
    sets_to_win: 2, tiebreakers: ['point_diff'], third_place_match: false, phase_rules: { final: { starting_score: 0, point_cap: 27 } },
  } as unknown as TournamentRules

  it('turns a saved tournament back into the draft it came from', () => {
    const d = draftFromTournament(tournament, rules, ['c1', 'c2'])
    expect(d).toMatchObject({
      title: 'Fall Slam', clubIds: ['c1', 'c2'], location: 'Gym', format: 'pool_bracket', bracketType: 'double',
      teamsAdvancePerPool: 0, price: 20, venmoHandle: '@host', startingScore: 4, tiebreakers: ['point_diff'],
    })
    expect(d.startDate?.toISOString()).toBe('2026-12-05T15:00:00.000Z')
    expect(d.phaseRules.final).toMatchObject({ startingScore: 0, pointCap: 27, winningScore: 25 })
    expect(d.phaseRules.bracket).toBeUndefined()
    // Saved again unchanged, it sends the same phase rules.
    expect(updateTournamentArgs('t1', d, null).p_rules.phase_rules).toEqual({ final: { starting_score: 0, point_cap: 27 } })
  })

  it('falls back to the one club before clubs could be linked', () => {
    expect(draftFromTournament(tournament, null, []).clubIds).toEqual(['c1'])
  })

  it('sends no status, and who hosts next', () => {
    const args = updateTournamentArgs('t1', draftFromTournament(tournament, rules, ['c1']), 'p2')
    expect(args.p_id).toBe('t1')
    expect(args.p_new_host).toBe('p2')
    expect(args.p_tournament).not.toHaveProperty('status')
  })

  it('counts each player once and leaves out the host', () => {
    const member = (user_id: string, first_name: string) => ({ user_id, profiles: { first_name, last_name: null, username: first_name.toLowerCase() } })
    const teams = [
      { captain_user_id: 'host', members: [member('host', 'Host'), member('p1', 'Ana')] },
      { captain_user_id: 'p2', members: [member('p2', 'Ben'), member('p1', 'Ana')] },
    ] as unknown as TournamentTeamWithRoster[]
    expect(tournamentPlayers(teams, 'host')).toEqual([{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Ben' }])
  })
})
