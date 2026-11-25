-- Undo #282: drop post_solo_teams, put back save_tournament from #325, drop the columns.
drop function if exists public.post_solo_teams(uuid, jsonb);

create or replace function public.save_tournament(
  p_tournament jsonb,
  p_rules jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
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
  if coalesce(t.price, 0) < 0 then
    raise exception 'save_tournament: price must not be negative' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.club_members m where m.club_id = t.club_id and m.user_id = auth.uid()
  ) then
    raise exception 'save_tournament: not a member of that club' using errcode = '42501';
  end if;

  insert into public.tournaments (
    club_id, created_by, title, description, location, skill_levels, start_date,
    registration_deadline, status, format, bracket_type, max_teams, min_roster_size,
    max_roster_size, teams_advance_per_pool, has_refs, price, venmo_handle, published_at
  ) values (
    t.club_id, auth.uid(), btrim(t.title), nullif(btrim(t.description), ''), nullif(btrim(t.location), ''),
    coalesce(t.skill_levels, '{}'), t.start_date, t.registration_deadline, v_status, t.format,
    t.bracket_type, t.max_teams, coalesce(t.min_roster_size, 6), coalesce(t.max_roster_size, 10),
    coalesce(t.teams_advance_per_pool, 2), coalesce(t.has_refs, false), coalesce(t.price, 0),
    nullif(btrim(t.venmo_handle), ''), case when v_status = 'published' then now() end
  )
  returning id into new_id;

  insert into public.tournament_rules (
    tournament_id, starting_score, winning_score, deciding_set_score, win_by_margin,
    point_cap, sets_to_win, tiebreakers, third_place_match
  )
  select new_id, coalesce(r.starting_score, 0), coalesce(r.winning_score, 25), coalesce(r.deciding_set_score, 15),
         coalesce(r.win_by_margin, 2), r.point_cap, coalesce(r.sets_to_win, 2),
         coalesce(r.tiebreakers, array['head_to_head', 'set_ratio', 'point_diff', 'points_for']),
         coalesce(r.third_place_match, false)
  from jsonb_populate_record(null::public.tournament_rules, coalesce(p_rules, '{}'::jsonb)) r;

  return new_id;
end;
$$;

revoke all on function public.save_tournament(jsonb, jsonb) from public, anon;
grant execute on function public.save_tournament(jsonb, jsonb) to authenticated;

revoke all on function public.save_tournament(jsonb, jsonb) from public, anon;
grant execute on function public.save_tournament(jsonb, jsonb) to authenticated;

alter table public.tournaments
  drop constraint if exists tournaments_team_pins_check,
  drop constraint if exists tournaments_team_size_check,
  drop constraint if exists tournaments_team_mode_check,
  drop column if exists team_pins,
  drop column if exists team_size,
  drop column if exists team_mode;
