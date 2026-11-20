import type {
  PublicTournamentPayload, PublicTournamentView, Tournament, TournamentMatchRow, TournamentTeamWithRoster,
} from '../types'

/**
 * `get_public_tournament()`'s answer, turned into the rows the tournament page
 * draws for members, so a guest (or a signed-in player outside the club) sees
 * the same page read-only (#282). The payload carries names, scores, courts and
 * times only; everything it leaves out (payment handle, who created it) is
 * filled with a value that switches the matching UI off.
 */
export function publicTournamentView(p: PublicTournamentPayload | null | undefined): PublicTournamentView | null {
  if (!p || !p.id) return null
  const tournament = {
    id: p.id,
    club_id: p.club?.id ?? '',
    created_by: '',
    title: p.title,
    description: p.description ?? null,
    location: p.location,
    skill_levels: p.skill_levels ?? [],
    start_date: p.start_date,
    registration_deadline: p.registration_deadline,
    status: p.status,
    format: p.format,
    bracket_type: p.bracket_type,
    max_teams: p.max_teams,
    min_roster_size: p.min_roster_size ?? 1,
    max_roster_size: p.max_roster_size ?? 0,
    teams_advance_per_pool: p.teams_advance_per_pool ?? 2,
    has_refs: !!p.has_refs,
    price: p.price ?? 0,
    venmo_handle: null,
    schedule_published: p.schedule_published ?? p.matches.length > 0,
    match_duration_minutes: 45,
    break_duration_minutes: 10,
    num_courts: 1,
    schedule_generated_at: null,
    published_at: null,
    cancelled_at: null,
    created_at: p.start_date,
    house_rule: null,
    pool_matches_per_team: null,
    warmup_minutes: 0,
  } as Tournament

  const teams: TournamentTeamWithRoster[] = p.teams.map(t => ({
    id: t.id,
    tournament_id: p.id,
    name: t.name,
    captain_user_id: t.players.find(pl => pl.captain)?.id ?? null,
    status: 'registered',
    is_locked: false,
    seed: t.seed,
    is_approved: true,
    is_paid: false,
    created_at: p.start_date,
    members: t.players.map(pl => ({
      id: `${t.id}:${pl.id}`,
      team_id: t.id,
      user_id: pl.id,
      is_captain: pl.captain,
      joined_at: p.start_date,
      profiles: { id: pl.id, username: pl.name, first_name: pl.name, last_name: null, avatar_url: null, skill_level: null, position: [] },
    })),
  }))

  const matches = p.matches.map(m => ({
    id: m.id,
    tournament_id: p.id,
    pool_id: m.pool_id,
    stage: m.stage,
    round: m.round,
    match_number: m.match_number,
    team_a_id: m.team_a_id,
    team_b_id: m.team_b_id,
    court: m.court,
    scheduled_at: m.scheduled_at,
    status: m.status,
    winner_id: m.winner_id,
    bracket_round_name: m.bracket_round_name,
    is_losers_bracket: !!m.is_losers_bracket,
    ref_team_id: m.ref_team_id,
    sets: m.sets.map(([a, b], i) => ({ set_number: i + 1, team_a_score: a, team_b_score: b })),
  })) as TournamentMatchRow[]

  return {
    tournament,
    club: p.club,
    teams,
    pools: p.pools.map((pl, i) => ({ id: pl.id, name: pl.name, display_order: pl.display_order ?? i, team_ids: pl.team_ids })),
    matches,
  }
}
