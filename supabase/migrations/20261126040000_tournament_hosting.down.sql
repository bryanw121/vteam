-- Undo 20261126040000_tournament_hosting (beta rollback only).
drop function if exists public.update_tournament(uuid, jsonb, jsonb, uuid);
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted', 'event_cancelled', 'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned', 'join_request', 'request_approved', 'request_denied', 'tournament_team_invite', 'tournament_join_request', 'tournament_join_accepted', 'tournament_join_declined', 'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention', 'event_reminder', 'late_dropout', 'friend_request', 'friend_accepted', 'bring_item_uncovered', 'report_resolved', 'moderation_warning', 'new_game', 'club_poll'
  ])
);
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_pools;
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_matches;
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_rules;
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_prizes;
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_comments;
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_days;
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_divisions;
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_teams;
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_team_members;
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_pool_teams;
drop policy if exists "open or linked-club tournament rows visible" on public.tournament_sets;
drop policy if exists "open or linked-club tournaments visible" on public.tournaments;
drop policy if exists "open or linked-club tournament players can comment" on public.tournament_comments;
drop policy if exists "creator can insert tournaments" on public.tournaments;
create policy "creator can insert tournaments" on public.tournaments
  for insert
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.club_members m
      where m.club_id = tournaments.club_id and m.user_id = (select auth.uid())
    )
  );
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
drop table if exists public.tournament_clubs;
drop function if exists public.tournament_open_to_me(uuid);
delete from public.tournaments where club_id is null;
alter table public.tournaments alter column club_id set not null;
