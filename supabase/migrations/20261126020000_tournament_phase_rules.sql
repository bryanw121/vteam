-- #404: scoring rules per phase. tournament_rules keeps the base rules (pool play, or all games);
-- phase_rules holds what a later phase changes: {"bracket": {"starting_score": 0, "point_cap": 27}, "losers": {...}, "final": {...}}.
-- A phase that isn't there, or a field it leaves out, uses the base rules. Expand only: old builds
-- never read the column and save_tournament's signature is unchanged.
-- #403 ("every pool team goes to the bracket") needs no schema: teams_advance_per_pool = 0 means all.

alter table public.tournament_rules
  add column if not exists phase_rules jsonb not null default '{}'::jsonb;

alter table public.tournament_rules
  add constraint tournament_rules_phase_rules_check check (jsonb_typeof(phase_rules) = 'object');

/** The phases a host can set rules for, and the fields each may carry, with their bounds. Raises 22023 otherwise. */
create or replace function public.valid_phase_rules(p jsonb) returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  k text;
  v jsonb;
  f text;
  n numeric;
  lo numeric;
  hi numeric;
begin
  if p is null or p = 'null'::jsonb then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then
    raise exception 'phase_rules: an object of phases' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p) loop
    if k not in ('bracket', 'losers', 'final') then
      raise exception 'phase_rules: unknown phase %', k using errcode = '22023';
    end if;
    if jsonb_typeof(v) <> 'object' then
      raise exception 'phase_rules: % must be an object', k using errcode = '22023';
    end if;
    for f in select jsonb_object_keys(v) loop
      if f not in ('starting_score', 'winning_score', 'deciding_set_score', 'win_by_margin', 'point_cap', 'sets_to_win') then
        raise exception 'phase_rules: unknown field %.%', k, f using errcode = '22023';
      end if;
      if v->f = 'null'::jsonb and f = 'point_cap' then continue; end if;
      if jsonb_typeof(v->f) <> 'number' then
        raise exception 'phase_rules: %.% must be a number', k, f using errcode = '22023';
      end if;
      n := (v->>f)::numeric;
      -- Bounds first: PL/pgSQL ends an IF condition at its first THEN, so no CASE inside one.
      lo := case f when 'win_by_margin' then 1 when 'sets_to_win' then 1 when 'starting_score' then 0 else 5 end;
      hi := case f when 'starting_score' then 20 when 'win_by_margin' then 5 when 'sets_to_win' then 3 else 60 end;
      if n <> trunc(n) or n < lo or n > hi then
        raise exception 'phase_rules: %.% out of range', k, f using errcode = '22023';
      end if;
    end loop;
  end loop;
  return p;
end;
$$;

create or replace function public.save_tournament(p_tournament jsonb, p_rules jsonb default '{}'::jsonb)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
declare
  t public.tournaments;
  v_status text := coalesce(p_tournament->>'status', 'draft');
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'save_tournament: sign in first' using errcode = '42501';
  end if;

  t := jsonb_populate_record(null::public.tournaments, p_tournament);
  if coalesce(btrim(t.title), '') = '' then
    raise exception 'save_tournament: title required' using errcode = '22023';
  end if;
  if t.club_id is null then
    raise exception 'save_tournament: club required' using errcode = '22023';
  end if;
  if t.start_date is null then
    raise exception 'save_tournament: start date required' using errcode = '22023';
  end if;
  if v_status not in ('draft', 'published') then
    raise exception 'save_tournament: a new tournament is a draft or published' using errcode = '22023';
  end if;
  if coalesce(t.min_roster_size, 6) > coalesce(t.max_roster_size, 10) then
    raise exception 'save_tournament: min roster above max' using errcode = '22023';
  end if;
  if coalesce(t.team_mode, 'captains') not in ('captains', 'solo') then
    raise exception 'save_tournament: team_mode is captains or solo' using errcode = '22023';
  end if;
  if coalesce(t.price, 0) < 0 then
    raise exception 'save_tournament: price must not be negative' using errcode = '22023';
  end if;
  if coalesce(t.teams_advance_per_pool, 2) < 0 then
    raise exception 'save_tournament: teams advancing is 0 (all) or more' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.club_members m where m.club_id = t.club_id and m.user_id = auth.uid()
  ) then
    raise exception 'save_tournament: not a member of that club' using errcode = '42501';
  end if;

  insert into public.tournaments (
    club_id, created_by, title, description, location, skill_levels, start_date,
    registration_deadline, status, format, bracket_type, max_teams, min_roster_size,
    max_roster_size, teams_advance_per_pool, has_refs, price, venmo_handle, published_at,
    team_mode, team_size
  ) values (
    t.club_id, auth.uid(), btrim(t.title), nullif(btrim(t.description), ''), nullif(btrim(t.location), ''),
    coalesce(t.skill_levels, '{}'), t.start_date, t.registration_deadline, v_status, t.format,
    t.bracket_type, t.max_teams, coalesce(t.min_roster_size, 6), coalesce(t.max_roster_size, 10),
    coalesce(t.teams_advance_per_pool, 2), coalesce(t.has_refs, false), coalesce(t.price, 0),
    nullif(btrim(t.venmo_handle), ''), case when v_status = 'published' then now() end,
    coalesce(t.team_mode, 'captains'), case when t.team_mode = 'solo' then t.team_size end
  )
  returning id into new_id;

  insert into public.tournament_rules (
    tournament_id, starting_score, winning_score, deciding_set_score, win_by_margin,
    point_cap, sets_to_win, tiebreakers, third_place_match, phase_rules
  )
  select new_id, coalesce(r.starting_score, 0), coalesce(r.winning_score, 25), coalesce(r.deciding_set_score, 15),
         coalesce(r.win_by_margin, 2), r.point_cap, coalesce(r.sets_to_win, 2),
         coalesce(r.tiebreakers, array['head_to_head', 'set_ratio', 'point_diff', 'points_for']),
         coalesce(r.third_place_match, false),
         public.valid_phase_rules(coalesce(p_rules, '{}'::jsonb)->'phase_rules')
  from jsonb_populate_record(null::public.tournament_rules, coalesce(p_rules, '{}'::jsonb) - 'phase_rules') r;

  return new_id;
end;
$function$;

revoke all on function public.save_tournament(jsonb, jsonb) from public, anon;
grant execute on function public.save_tournament(jsonb, jsonb) to authenticated;
revoke all on function public.valid_phase_rules(jsonb) from public, anon;
grant execute on function public.valid_phase_rules(jsonb) to authenticated;
