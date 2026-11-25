-- #282: tournaments where players sign up alone and the organizer makes the teams.
-- Expand only: three columns with defaults (old builds keep inserting without
-- them and get today's captain flow), save_tournament learns team_mode and
-- team_size, and post_solo_teams turns the solo sign-ups into teams in one
-- transaction.
--
-- A solo sign-up is the existing free-agent entry (tournament_teams with
-- status 'free_agent' and the player as its only member), so registration,
-- withdrawing, the waitlist and RLS work as they do today.

alter table public.tournaments
  add column if not exists team_mode text not null default 'captains',
  add column if not exists team_size smallint,
  add column if not exists team_pins jsonb not null default '[]'::jsonb;

alter table public.tournaments
  add constraint tournaments_team_mode_check check (team_mode in ('captains', 'solo')),
  add constraint tournaments_team_size_check check (team_size is null or team_size between 2 and 12),
  add constraint tournaments_team_pins_check check (jsonb_typeof(team_pins) = 'array');

comment on column public.tournaments.team_mode is 'captains: captains register teams and invite players. solo: players sign up alone (free-agent entries) and the organizer makes the teams (#282).';
comment on column public.tournaments.team_size is 'solo: players per team the organizer aims for.';
comment on column public.tournaments.team_pins is 'solo: groups of user ids the organizer keeps on one team, [[uid, uid], ...]. Cleared when teams are posted.';

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
  if coalesce(t.team_mode, 'captains') not in ('captains', 'solo') then
    raise exception 'save_tournament: team_mode is captains or solo' using errcode = '22023';
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

-- The organizer posts the teams they drew: p_teams = [{"name": "Team 1", "captain": uid, "members": [uid, ...]}, ...].
-- Every member must have a solo sign-up (free-agent entry) in this tournament
-- and appear once. Their free-agent entries are replaced by the new teams.
-- SECURITY INVOKER: the writes go through RLS (the creator manages teams and
-- members) and the creator bypass in the insert triggers.
create or replace function public.post_solo_teams(p_tournament_id uuid, p_teams jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  t public.tournaments;
  team jsonb;
  member text;
  uid uuid;
  captain uuid;
  new_team uuid;
  seen uuid[] := '{}';
  posted integer := 0;
begin
  select * into t from public.tournaments where id = p_tournament_id for update;
  if not found or t.created_by is distinct from auth.uid() then
    raise exception 'post_solo_teams: only the organizer can make teams' using errcode = '42501';
  end if;
  if t.team_mode <> 'solo' then
    raise exception 'post_solo_teams: this tournament has captains' using errcode = '22023';
  end if;
  if jsonb_typeof(p_teams) <> 'array' or jsonb_array_length(p_teams) < 2 or jsonb_array_length(p_teams) > 64 then
    raise exception 'post_solo_teams: 2 to 64 teams' using errcode = '22023';
  end if;

  for team in select * from jsonb_array_elements(p_teams) loop
    if jsonb_typeof(team->'members') <> 'array' or jsonb_array_length(team->'members') = 0 then
      raise exception 'post_solo_teams: a team has no players' using errcode = '22023';
    end if;
    if coalesce(btrim(team->>'name'), '') = '' or length(team->>'name') > 60 then
      raise exception 'post_solo_teams: a team needs a name' using errcode = '22023';
    end if;
    captain := nullif(team->>'captain', '')::uuid;
    if captain is not null and not (team->'members') ? captain::text then
      raise exception 'post_solo_teams: the captain must be on the team' using errcode = '22023';
    end if;

    for member in select jsonb_array_elements_text(team->'members') loop
      uid := member::uuid;
      if uid = any(seen) then
        raise exception 'post_solo_teams: a player is on two teams' using errcode = '22023';
      end if;
      seen := seen || uid;
      if not exists (
        select 1 from public.tournament_teams ft
        join public.tournament_team_members fm on fm.team_id = ft.id
        where ft.tournament_id = p_tournament_id and ft.status = 'free_agent' and fm.user_id = uid
      ) then
        raise exception 'post_solo_teams: a player is not signed up solo' using errcode = '22023';
      end if;
    end loop;

    insert into public.tournament_teams (tournament_id, name, captain_user_id, status, is_approved)
    values (p_tournament_id, btrim(team->>'name'), coalesce(captain, (team->'members'->>0)::uuid), 'registered', true)
    returning id into new_team;

    for member in select jsonb_array_elements_text(team->'members') loop
      uid := member::uuid;
      delete from public.tournament_teams ft
      where ft.tournament_id = p_tournament_id and ft.status = 'free_agent'
        and exists (select 1 from public.tournament_team_members fm where fm.team_id = ft.id and fm.user_id = uid);
      insert into public.tournament_team_members (team_id, user_id, is_captain)
      values (new_team, uid, uid = coalesce(captain, (team->'members'->>0)::uuid));
    end loop;
    posted := posted + 1;
  end loop;

  update public.tournaments set team_pins = '[]'::jsonb where id = p_tournament_id;
  return posted;
end;
$$;

revoke all on function public.post_solo_teams(uuid, jsonb) from public, anon;
grant execute on function public.post_solo_teams(uuid, jsonb) to authenticated;
