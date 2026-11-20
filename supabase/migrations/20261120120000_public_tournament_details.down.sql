-- Back to the payload of 20261119030000_public_tournament.sql.

create or replace function public.build_public_tournament(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'status', t.status,
    'start_date', t.start_date,
    'location', t.location,
    'format', t.format,
    'bracket_type', t.bracket_type,
    'price', t.price,
    'registration_deadline', t.registration_deadline,
    'max_teams', t.max_teams,
    'club', (select jsonb_build_object('id', c.id, 'name', c.name) from public.clubs c where c.id = t.club_id),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tt.id, 'name', tt.name, 'seed', tt.seed,
        'players', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id,
            'name', coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username, 'Player'),
            'captain', m.is_captain
          ) order by m.is_captain desc, m.joined_at)
          from public.tournament_team_members m join public.profiles p on p.id = m.user_id
          where m.team_id = tt.id
        ), '[]'::jsonb)
      ) order by tt.seed nulls last, tt.name)
      from public.tournament_teams tt
      where tt.tournament_id = t.id and tt.status = 'registered'
    ), '[]'::jsonb),
    'pools', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pl.id, 'name', pl.name,
        'team_ids', coalesce((select jsonb_agg(pt.team_id) from public.tournament_pool_teams pt where pt.pool_id = pl.id), '[]'::jsonb)
      ) order by pl.display_order)
      from public.tournament_pools pl where pl.tournament_id = t.id
    ), '[]'::jsonb),
    -- The schedule shows once the organizer has published it (or play has started).
    'matches', case when t.schedule_published or t.status in ('in_progress', 'completed') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', mt.id, 'stage', mt.stage, 'round', mt.round, 'match_number', mt.match_number,
        'bracket_round_name', mt.bracket_round_name, 'is_losers_bracket', mt.is_losers_bracket,
        'pool_id', mt.pool_id, 'court', mt.court, 'scheduled_at', mt.scheduled_at, 'status', mt.status,
        'team_a_id', mt.team_a_id, 'team_b_id', mt.team_b_id, 'winner_id', mt.winner_id, 'ref_team_id', mt.ref_team_id,
        'sets', coalesce((
          select jsonb_agg(jsonb_build_array(s.team_a_score, s.team_b_score) order by s.set_number)
          from public.tournament_sets s where s.match_id = mt.id
        ), '[]'::jsonb)
      ) order by mt.stage, mt.round, mt.match_number)
      from public.tournament_matches mt where mt.tournament_id = t.id
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.tournaments t
  where t.id = p_id and t.status <> 'draft';
$$;
revoke execute on function public.build_public_tournament(uuid) from public, anon, authenticated;
