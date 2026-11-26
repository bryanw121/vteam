-- #401: hosting a tournament needs no club. A tournament can be linked to any number of the host's
-- clubs (tournament_clubs; tournaments.club_id stays the first, for older builds), or to none: then
-- anyone signed in can see it once it isn't a draft. The club-member read policies stay; new
-- permissive ones add club-less and linked-club tournaments, all through tournament_open_to_me().
-- #402: update_tournament lets the host change anything, hand the tournament to someone else, and
-- tells every player what changed ('tournament_updated' notifications).
-- Expand only: club_id loses NOT NULL (nothing writes null before this build), the rest is new.

alter table public.tournaments alter column club_id drop not null;

create table if not exists public.tournament_clubs (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tournament_id, club_id)
);
create index if not exists tournament_clubs_club_idx on public.tournament_clubs (club_id);
alter table public.tournament_clubs enable row level security;

-- Every existing tournament is linked to its club.
insert into public.tournament_clubs (tournament_id, club_id)
select id, club_id from public.tournaments where club_id is not null
on conflict do nothing;

/* A non-draft tournament the signed-in caller may read: linked to no club, or to a club they are in. */
create or replace function public.tournament_open_to_me(p_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = p_id and t.status <> 'draft' and auth.uid() is not null and (
      (t.club_id is null and not exists (select 1 from public.tournament_clubs c where c.tournament_id = t.id))
      or exists (
        select 1 from public.tournament_clubs c join public.club_members m on m.club_id = c.club_id
        where c.tournament_id = t.id and m.user_id = auth.uid()
      )
    )
  );
$$;
revoke all on function public.tournament_open_to_me(uuid) from public, anon;
grant execute on function public.tournament_open_to_me(uuid) to authenticated;

create policy "tournament clubs visible with the tournament" on public.tournament_clubs
  for select to authenticated using (
    public.tournament_open_to_me(tournament_id)
    or exists (select 1 from public.tournaments t where t.id = tournament_clubs.tournament_id and t.created_by = (select auth.uid()))
  );
create policy "host links their own clubs" on public.tournament_clubs
  for insert to authenticated with check (
    exists (select 1 from public.tournaments t where t.id = tournament_clubs.tournament_id and t.created_by = (select auth.uid()))
    and exists (select 1 from public.club_members m where m.club_id = tournament_clubs.club_id and m.user_id = (select auth.uid()))
  );

create policy "open or linked-club tournaments visible" on public.tournaments
  for select to authenticated using (public.tournament_open_to_me(id));

create policy "open or linked-club tournament rows visible" on public.tournament_pools
  for select to authenticated using (public.tournament_open_to_me(tournament_id));

create policy "open or linked-club tournament rows visible" on public.tournament_matches
  for select to authenticated using (public.tournament_open_to_me(tournament_id));

create policy "open or linked-club tournament rows visible" on public.tournament_rules
  for select to authenticated using (public.tournament_open_to_me(tournament_id));

create policy "open or linked-club tournament rows visible" on public.tournament_prizes
  for select to authenticated using (public.tournament_open_to_me(tournament_id));

create policy "open or linked-club tournament rows visible" on public.tournament_comments
  for select to authenticated using (public.tournament_open_to_me(tournament_id));

create policy "open or linked-club tournament rows visible" on public.tournament_days
  for select to authenticated using (public.tournament_open_to_me(tournament_id));

create policy "open or linked-club tournament rows visible" on public.tournament_divisions
  for select to authenticated using (public.tournament_open_to_me(tournament_id));

create policy "open or linked-club tournament rows visible" on public.tournament_teams
  for select to authenticated using (public.tournament_open_to_me(tournament_id));

create policy "open or linked-club tournament rows visible" on public.tournament_team_members
  for select to authenticated using (exists (
    select 1 from public.tournament_teams tt where tt.id = tournament_team_members.team_id and public.tournament_open_to_me(tt.tournament_id)
  ));

create policy "open or linked-club tournament rows visible" on public.tournament_pool_teams
  for select to authenticated using (exists (
    select 1 from public.tournament_pools p where p.id = tournament_pool_teams.pool_id and public.tournament_open_to_me(p.tournament_id)
  ));

create policy "open or linked-club tournament rows visible" on public.tournament_sets
  for select to authenticated using (exists (
    select 1 from public.tournament_matches m where m.id = tournament_sets.match_id and public.tournament_open_to_me(m.tournament_id)
  ));

create policy "open or linked-club tournament players can comment" on public.tournament_comments
  for insert to authenticated with check (user_id = (select auth.uid()) and public.tournament_open_to_me(tournament_id));

drop policy if exists "creator can insert tournaments" on public.tournaments;
create policy "creator can insert tournaments" on public.tournaments
  for insert
  with check (
    created_by = (select auth.uid())
    and (
      club_id is null
      or exists (select 1 from public.club_members m where m.club_id = tournaments.club_id and m.user_id = (select auth.uid()))
    )
  );

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted', 'event_cancelled', 'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned', 'join_request', 'request_approved', 'request_denied', 'tournament_team_invite', 'tournament_join_request', 'tournament_join_accepted', 'tournament_join_declined', 'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention', 'event_reminder', 'late_dropout', 'friend_request', 'friend_accepted', 'bring_item_uncovered', 'report_resolved', 'moderation_warning', 'new_game', 'club_poll', 'tournament_updated'
  ])
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
  v_clubs uuid[] := '{}';
  c uuid;
begin
  if auth.uid() is null then
    raise exception 'save_tournament: sign in first' using errcode = '42501';
  end if;

  t := jsonb_populate_record(null::public.tournaments, p_tournament);
  if coalesce(btrim(t.title), '') = '' then
    raise exception 'save_tournament: title required' using errcode = '22023';
  end if;
  -- #401: clubs are optional, and there can be several (the first is club_id, for older builds).
  if jsonb_typeof(p_tournament->'club_ids') = 'array' then
    v_clubs := array(select distinct x::uuid from jsonb_array_elements_text(p_tournament->'club_ids') x);
  end if;
  if t.club_id is not null and not (t.club_id = any(v_clubs)) then
    v_clubs := t.club_id || v_clubs;
  end if;
  if coalesce(array_length(v_clubs, 1), 0) > 10 then
    raise exception 'save_tournament: at most 10 clubs' using errcode = '22023';
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
  foreach c in array v_clubs loop
    if not exists (select 1 from public.club_members m where m.club_id = c and m.user_id = auth.uid()) then
      raise exception 'save_tournament: not a member of that club' using errcode = '42501';
    end if;
  end loop;
  t.club_id := v_clubs[1];

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

  insert into public.tournament_clubs (tournament_id, club_id)
  select new_id, x from unnest(v_clubs) x;

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

/*
 * #402: the host edits a tournament. Fields left out of p_tournament / p_rules stay as they are.
 * p_tournament.club_ids (if present) replaces the linked clubs; p_new_host hands the tournament to
 * another player. Everyone on a team or signed up solo (not the editor) gets one 'tournament_updated'
 * notification saying what changed, unless it is still a draft. Returns how many were told.
 */
create or replace function public.update_tournament(
  p_id uuid,
  p_tournament jsonb default '{}'::jsonb,
  p_rules jsonb default '{}'::jsonb,
  p_new_host uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  old public.tournaments;
  t public.tournaments;
  old_rules public.tournament_rules;
  r public.tournament_rules;
  v_clubs uuid[];
  old_clubs uuid[];
  c uuid;
  changes text[] := '{}';
  told integer := 0;
begin
  if me is null then
    raise exception 'update_tournament: sign in first' using errcode = '42501';
  end if;
  select * into old from public.tournaments where id = p_id for update;
  if not found then
    raise exception 'update_tournament: no such tournament' using errcode = 'P0002';
  end if;
  if old.created_by <> me then
    raise exception 'update_tournament: only the host can edit it' using errcode = '42501';
  end if;

  t := jsonb_populate_record(old, coalesce(p_tournament, '{}'::jsonb) - 'club_ids' - 'id' - 'created_by' - 'created_at' - 'status' - 'published_at');
  if coalesce(btrim(t.title), '') = '' then
    raise exception 'update_tournament: title required' using errcode = '22023';
  end if;
  if t.start_date is null then
    raise exception 'update_tournament: start date required' using errcode = '22023';
  end if;
  if coalesce(t.min_roster_size, 6) > coalesce(t.max_roster_size, 10) then
    raise exception 'update_tournament: min roster above max' using errcode = '22023';
  end if;
  if coalesce(t.team_mode, 'captains') not in ('captains', 'solo') then
    raise exception 'update_tournament: team_mode is captains or solo' using errcode = '22023';
  end if;
  if coalesce(t.price, 0) < 0 then
    raise exception 'update_tournament: price must not be negative' using errcode = '22023';
  end if;
  if coalesce(t.teams_advance_per_pool, 2) < 0 then
    raise exception 'update_tournament: teams advancing is 0 (all) or more' using errcode = '22023';
  end if;

  -- Clubs: replace the links (each one a club the host is in).
  old_clubs := array(select club_id from public.tournament_clubs where tournament_id = p_id order by created_at, club_id);
  if jsonb_typeof(p_tournament->'club_ids') = 'array' then
    v_clubs := array(select distinct x::uuid from jsonb_array_elements_text(p_tournament->'club_ids') x);
    if coalesce(array_length(v_clubs, 1), 0) > 10 then
      raise exception 'update_tournament: at most 10 clubs' using errcode = '22023';
    end if;
    foreach c in array v_clubs loop
      if not (c = any(old_clubs)) and not exists (select 1 from public.club_members m where m.club_id = c and m.user_id = me) then
        raise exception 'update_tournament: not a member of that club' using errcode = '42501';
      end if;
    end loop;
    delete from public.tournament_clubs where tournament_id = p_id and not (club_id = any(v_clubs));
    insert into public.tournament_clubs (tournament_id, club_id) select p_id, x from unnest(v_clubs) x on conflict do nothing;
    t.club_id := v_clubs[1];
    if not (old_clubs @> v_clubs and v_clubs @> old_clubs) then changes := array_append(changes, 'clubs'); end if;
  end if;

  -- Host: hand it to another player.
  if p_new_host is not null and p_new_host <> me then
    if not exists (select 1 from public.profiles p where p.id = p_new_host) then
      raise exception 'update_tournament: no such player' using errcode = '22023';
    end if;
    t.created_by := p_new_host;
    changes := array_append(changes, 'host');
  end if;

  update public.tournaments set
    title = btrim(t.title), description = nullif(btrim(t.description), ''), location = nullif(btrim(t.location), ''),
    skill_levels = coalesce(t.skill_levels, '{}'), start_date = t.start_date, registration_deadline = t.registration_deadline,
    format = t.format, bracket_type = t.bracket_type, max_teams = t.max_teams,
    min_roster_size = coalesce(t.min_roster_size, 6), max_roster_size = coalesce(t.max_roster_size, 10),
    teams_advance_per_pool = coalesce(t.teams_advance_per_pool, 2), has_refs = coalesce(t.has_refs, false),
    price = coalesce(t.price, 0), venmo_handle = nullif(btrim(t.venmo_handle), ''),
    team_mode = coalesce(t.team_mode, 'captains'), team_size = t.team_size,
    club_id = t.club_id, created_by = t.created_by
  where id = p_id;

  if t.title is distinct from old.title then changes := array_append(changes, 'name'); end if;
  if t.start_date is distinct from old.start_date then changes := array_append(changes, 'start time'); end if;
  if t.location is distinct from old.location then changes := array_append(changes, 'location'); end if;
  if t.registration_deadline is distinct from old.registration_deadline then changes := array_append(changes, 'sign-up deadline'); end if;
  if t.description is distinct from old.description then changes := array_append(changes, 'details'); end if;
  if (t.format, t.bracket_type, t.teams_advance_per_pool) is distinct from (old.format, old.bracket_type, old.teams_advance_per_pool) then
    changes := array_append(changes, 'format');
  end if;
  if (t.max_teams, t.min_roster_size, t.max_roster_size, t.team_mode, t.team_size) is distinct from
     (old.max_teams, old.min_roster_size, old.max_roster_size, old.team_mode, old.team_size) then
    changes := array_append(changes, 'teams');
  end if;
  if (t.price, t.venmo_handle) is distinct from (old.price, old.venmo_handle) then changes := array_append(changes, 'price'); end if;
  if t.skill_levels is distinct from old.skill_levels then changes := array_append(changes, 'levels'); end if;

  -- Rules: the fields given, phase rules checked.
  if coalesce(p_rules, '{}'::jsonb) <> '{}'::jsonb then
    select * into old_rules from public.tournament_rules where tournament_id = p_id;
    if found then
      r := jsonb_populate_record(old_rules, p_rules - 'phase_rules' - 'tournament_id');
      if p_rules ? 'phase_rules' then
        r.phase_rules := public.valid_phase_rules(p_rules->'phase_rules');
      end if;
      update public.tournament_rules set
        starting_score = r.starting_score, winning_score = r.winning_score, deciding_set_score = r.deciding_set_score,
        win_by_margin = r.win_by_margin, point_cap = r.point_cap, sets_to_win = r.sets_to_win,
        tiebreakers = r.tiebreakers, third_place_match = r.third_place_match, phase_rules = r.phase_rules
      where tournament_id = p_id;
      if (r.starting_score, r.winning_score, r.deciding_set_score, r.win_by_margin, r.point_cap, r.sets_to_win, r.tiebreakers, r.third_place_match, r.phase_rules)
         is distinct from (old_rules.starting_score, old_rules.winning_score, old_rules.deciding_set_score, old_rules.win_by_margin,
                           old_rules.point_cap, old_rules.sets_to_win, old_rules.tiebreakers, old_rules.third_place_match, old_rules.phase_rules) then
        changes := array_append(changes, 'rules');
      end if;
    end if;
  end if;

  -- Tell everyone in it (not drafts, not the editor), once, with what changed.
  if coalesce(array_length(changes, 1), 0) > 0 and old.status <> 'draft' then
    insert into public.notifications (user_id, notification_type, title, body, data)
    select u.user_id, 'tournament_updated', btrim(t.title) || ' was updated',
           'Changed: ' || array_to_string(changes, ', '),
           jsonb_build_object('tournament_id', p_id, 'changes', to_jsonb(changes), 'deep_link', '/tournament/' || p_id::text)
    from (
      select m.user_id from public.tournament_team_members m join public.tournament_teams tt on tt.id = m.team_id where tt.tournament_id = p_id
      union
      select tt.captain_user_id from public.tournament_teams tt where tt.tournament_id = p_id and tt.captain_user_id is not null
      union
      select p_new_host where p_new_host is not null
    ) u
    where u.user_id <> me
      and public.notification_pref_enabled(u.user_id, 'in_app', 'tournament_updated');
    get diagnostics told = row_count;
  end if;
  return told;
end;
$function$;
revoke all on function public.update_tournament(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.update_tournament(uuid, jsonb, jsonb, uuid) to authenticated;
