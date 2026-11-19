-- Public, read-only view of one tournament for the embeddable widget and for
-- guests: get_public_tournament(id). Tournament tables stay closed to anon;
-- this function is the only door, and it hands out names, scores, courts and
-- times only (no contact details, payment handles, chat or join requests).
--
-- Decided Nov 18 2026: any tournament that is not a draft can be read this way
-- by anyone who has its id, rosters with player names included (profiles are
-- already public to guests).
--
-- Throttled by source, since callers have no account:
--   per tournament: the answer is a saved copy (tournament_public_snapshots),
--     rebuilt at most once every 15 s however many people ask;
--   per viewer: 120 calls a minute per network address and tournament
--     (generous: at a venue many phones share one address), then HTTP 429.
-- Called with POST (a volatile function), so the counter can be written.

create table if not exists public.tournament_public_snapshots (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  built_at timestamptz not null default now(),
  payload jsonb not null
);
alter table public.tournament_public_snapshots enable row level security;
-- No policies and no client grants: only get_public_tournament() touches it.
revoke all on public.tournament_public_snapshots from anon, authenticated;

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

create or replace function public.get_public_tournament(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  -- The viewer's address as the API gateway reports it. A caller could send a
  -- made-up value, so this limit stops honest floods and lazy scripts; the
  -- saved copy below is what bounds the work whatever the caller does.
  v_ip text := coalesce(nullif(btrim(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
  v_snap public.tournament_public_snapshots;
  v_payload jsonb;
begin
  if p_id is null then return null; end if;
  if not public.check_rate_limit('pubt:' || md5(v_ip) || ':' || p_id::text, 120, 60) then
    raise exception using
      errcode = 'PT429',
      message = 'Too many requests. Please wait a moment and try again.',
      hint = 'Limit is 120 per 60 seconds.';
  end if;

  select * into v_snap from public.tournament_public_snapshots where tournament_id = p_id;
  if found and v_snap.built_at > now() - interval '15 seconds' then
    return v_snap.payload || jsonb_build_object('built_at', v_snap.built_at);
  end if;

  -- One rebuild at a time per tournament; everyone else gets the copy on hand.
  if not pg_try_advisory_xact_lock(hashtextextended('pubt:' || p_id::text, 0)) then
    if v_snap.tournament_id is not null then
      return v_snap.payload || jsonb_build_object('built_at', v_snap.built_at);
    end if;
    perform pg_advisory_xact_lock(hashtextextended('pubt:' || p_id::text, 0));
  end if;

  v_payload := public.build_public_tournament(p_id);
  if v_payload is null then
    -- Unknown id, or a draft: nothing to show, and nothing kept.
    delete from public.tournament_public_snapshots where tournament_id = p_id;
    return null;
  end if;
  insert into public.tournament_public_snapshots as s (tournament_id, built_at, payload)
  values (p_id, now(), v_payload)
  on conflict (tournament_id) do update set built_at = excluded.built_at, payload = excluded.payload;
  return v_payload || jsonb_build_object('built_at', now());
end;
$$;
revoke execute on function public.get_public_tournament(uuid) from public;
grant execute on function public.get_public_tournament(uuid) to anon, authenticated;
