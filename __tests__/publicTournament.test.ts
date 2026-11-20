import { publicTournamentView } from '../utils/publicTournament'
import { publicViewCopy } from '../constants/tournamentCopy'
import type { PublicTournamentPayload } from '../types'

const payload: PublicTournamentPayload = {
  id: 't1', title: 'Fall Cup', status: 'in_progress', start_date: '2026-11-21T15:00:00Z', location: 'Butler Park', format: 'pool_bracket',
  bracket_type: 'single', price: 40, registration_deadline: null, max_teams: 8, description: 'Doubles.', skill_levels: ['bb'],
  min_roster_size: 2, max_roster_size: 3, teams_advance_per_pool: 2, has_refs: false, schedule_published: true,
  club: { id: 'c1', name: 'Eastside' },
  teams: [
    { id: 'a', name: 'Aces', seed: 1, players: [{ id: 'u1', name: 'Ana Li', captain: true }, { id: 'u2', name: 'Bo', captain: false }] },
    { id: 'b', name: 'Blocks', seed: null, players: [] },
  ],
  pools: [{ id: 'p1', name: 'Pool A', team_ids: ['a', 'b'] }],
  matches: [{
    id: 'm1', stage: 'pool_play', round: 1, match_number: 1, bracket_round_name: null, is_losers_bracket: false, pool_id: 'p1', court: '2',
    scheduled_at: '2026-11-21T15:00:00Z', status: 'completed', team_a_id: 'a', team_b_id: 'b', winner_id: 'a', ref_team_id: null, sets: [[21, 15], [21, 19]],
  }],
}

describe('publicTournamentView', () => {
  test('nothing for an unknown id, a draft, or an answer that is not a tournament', () => {
    expect(publicTournamentView(null)).toBeNull()
    expect(publicTournamentView(undefined)).toBeNull()
    expect(publicTournamentView([] as unknown as PublicTournamentPayload)).toBeNull()
  })

  test('maps the payload into the rows the page draws', () => {
    const v = publicTournamentView(payload)!
    expect(v.tournament).toMatchObject({ id: 't1', title: 'Fall Cup', club_id: 'c1', description: 'Doubles.', schedule_published: true, price: 40 })
    expect(v.club).toEqual({ id: 'c1', name: 'Eastside' })
    expect(v.teams.map(t => [t.name, t.status, t.members.length])).toEqual([['Aces', 'registered', 2], ['Blocks', 'registered', 0]])
    expect(v.teams[0].captain_user_id).toBe('u1')
    expect(v.teams[0].members[0].profiles).toMatchObject({ id: 'u1', first_name: 'Ana Li', last_name: null })
    expect(v.pools).toEqual([{ id: 'p1', name: 'Pool A', display_order: 0, team_ids: ['a', 'b'] }])
    expect(v.matches[0].sets).toEqual([
      { set_number: 1, team_a_score: 21, team_b_score: 15 },
      { set_number: 2, team_a_score: 21, team_b_score: 19 },
    ])
  })

  test('never carries what the public copy leaves out', () => {
    const v = publicTournamentView(payload)!
    expect(v.tournament.venmo_handle).toBeNull()
    // No creator: nobody is treated as the organizer of a public copy.
    expect(v.tournament.created_by).toBe('')
  })

  test('an older payload without the added fields still draws', () => {
    const { description: _d, skill_levels: _s, min_roster_size: _a, max_roster_size: _b, teams_advance_per_pool: _c, has_refs: _h, schedule_published: _p, ...old } = payload
    const v = publicTournamentView(old)!
    expect(v.tournament.skill_levels).toEqual([])
    expect(v.tournament.schedule_published).toBe(true) // it has matches
    expect(publicTournamentView({ ...old, matches: [] })!.tournament.schedule_published).toBe(false)
  })
})

describe('publicViewCopy', () => {
  test('guests are asked to sign in, players outside the club to open it', () => {
    expect(publicViewCopy('Eastside', true).action).toBe('Sign in')
    expect(publicViewCopy('Eastside', false)).toMatchObject({ action: 'View club', body: 'Members of Eastside can register and chat.' })
    expect(publicViewCopy(null, false).discussion).toContain('the club')
  })
})
