/**
 * #325: the tournament wizard's pure rules (utils/tournamentDraft) and the
 * save, which is one save_tournament call.
 */
import {
  DEFAULT_TOURNAMENT_DRAFT, firstInvalidStep, formatHasBracket, formatHasPools, moveItem, newTournamentDraft,
  saveTournamentArgs, validateTournamentStep,
} from '../utils/tournamentDraft'
import { DEFAULT_TIEBREAKERS } from '../lib/tournamentStandings'
import type { TournamentDraft } from '../types'

const mockRpc = jest.fn()
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }))

const ready = (patch: Partial<TournamentDraft> = {}): TournamentDraft => ({
  ...newTournamentDraft(),
  title: '  Summer Slam ',
  clubId: 'club-1',
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

  it('step 1 needs a name, a club and a start date', () => {
    expect(validateTournamentStep(0, newTournamentDraft())).toBe('Please enter a tournament name.')
    expect(validateTournamentStep(0, ready({ title: '   ' }))).toBe('Please enter a tournament name.')
    expect(validateTournamentStep(0, ready({ clubId: '' }))).toBe('Please select a club.')
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
      tiebreakers: [...DEFAULT_TIEBREAKERS, 'sets_won'], third_place_match: false,
    })
  })

  it('has no bracket type without a bracket, and Venmo only when there is a fee', () => {
    expect(saveTournamentArgs(ready({ format: 'pool_play' }), 'draft').p_tournament.bracket_type).toBeNull()
    expect(saveTournamentArgs(ready({ venmoHandle: 'me' }), 'draft').p_tournament.venmo_handle).toBeNull()
    expect(saveTournamentArgs(ready({ price: 20, venmoHandle: ' me ' }), 'draft').p_tournament.venmo_handle).toBe('me')
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
