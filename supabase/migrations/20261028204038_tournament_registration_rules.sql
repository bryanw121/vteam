-- Tournament registration rules, enforced in the database (#7).
--
-- Until now every rule was client-side: the insert policy on tournament_teams is
-- just "signed in", so anyone with a tournament id could register after the
-- deadline, past max_teams, outside the skill levels, or onto a full roster, and
-- a captain could approve their own team or mark it paid ("captain can update
-- own team" covers every column). These triggers add the rules RLS can't express.
--
-- The organizer (tournaments.created_by) is exempt everywhere: they manage teams
-- freely (late adds, moving players, approvals). So are writes made by another
-- trigger (waitlist promotion below) and by the service role (no auth.uid()).
--
-- tournament_teams, BEFORE INSERT (registering a team or a free-agent entry):
--   - the tournament is published and the deadline (if any) hasn't passed
--   - the registrant is a member of the tournament's club and captains the team
--   - their skill level is one of tournaments.skill_levels (when any are set)
--   - past max_teams a team is waitlisted instead of registered (an advisory
--     lock per tournament serializes concurrent registrations)
--   - approval, payment, seed and lock flags start cleared
-- tournament_teams, BEFORE UPDATE: only the organizer may change status,
--   approval, payment, seed, lock or the tournament; captains may still rename
--   their team or hand over the captaincy.
-- tournament_team_members, BEFORE INSERT (joining a team: invite accepted,
--   join request approved, self-registration):
--   - the tournament is published and the deadline hasn't passed
--   - the player is a club member and their skill level is allowed
--   - the team's roster is below max_roster_size (free-agent entries excepted)
-- tournament_teams, AFTER DELETE / AFTER UPDATE OF status: when a registered
--   team leaves, the earliest waitlisted team takes its place (published
--   tournaments with max_teams only).
--
-- Expand-only: new functions and triggers, no table changes. Existing rows are
-- untouched. Trigger functions are SECURITY DEFINER (they read tournaments,
-- profiles and rosters regardless of the caller's RLS) with an empty
-- search_path; triggers can't be called directly, and EXECUTE is revoked anyway.

create or replace function public.tournament_registration_check(
  p_tournament public.tournaments,
  p_player uuid
) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_skill text;
begin
  if p_tournament.status is distinct from 'published' then
    raise exception 'Registration is closed for this tournament' using errcode = 'P0001';
  end if;
  if p_tournament.registration_deadline is not null and now() > p_tournament.registration_deadline then
    raise exception 'The registration deadline has passed' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.club_members cm
    where cm.club_id = p_tournament.club_id and cm.user_id = p_player
  ) then
    raise exception 'Only members of the hosting club can play in this tournament' using errcode = '42501';
  end if;
  if coalesce(array_length(p_tournament.skill_levels, 1), 0) > 0 then
    select p.skill_level into v_skill from public.profiles p where p.id = p_player;
    if v_skill is null or not (v_skill = any (p_tournament.skill_levels)) then
      raise exception 'This tournament is limited to certain skill levels, and % not eligible',
        case when p_player = auth.uid() then 'you are' else 'that player is' end
        using errcode = 'P0001',
              hint = 'Set your skill level on your profile if it is missing.';
    end if;
  end if;
end;
$$;

revoke all on function public.tournament_registration_check(public.tournaments, uuid) from public, anon, authenticated;

-- ─── Registering a team ───────────────────────────────────────────────────────

create or replace function public.tournament_team_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tournaments%rowtype;
  v_registered integer;
begin
  select * into v_t from public.tournaments where id = new.tournament_id;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if v_uid is null or v_uid = v_t.created_by or pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.captain_user_id is distinct from v_uid then
    raise exception 'You can only register a team you captain' using errcode = '42501';
  end if;
  if new.status not in ('registered', 'free_agent', 'waitlisted') then
    raise exception 'Invalid registration status' using errcode = '22023';
  end if;
  perform public.tournament_registration_check(v_t, v_uid);

  new.is_approved := false;
  new.is_paid := false;
  new.is_locked := false;
  new.seed := null;

  if new.status = 'registered' and v_t.max_teams is not null then
    perform pg_advisory_xact_lock(hashtextextended('tournament_teams:' || new.tournament_id::text, 0));
    select count(*) into v_registered
    from public.tournament_teams
    where tournament_id = new.tournament_id and status = 'registered';
    if v_registered >= v_t.max_teams then
      new.status := 'waitlisted';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tournament_team_before_insert() from public, anon, authenticated;

drop trigger if exists tournament_team_before_insert on public.tournament_teams;
create trigger tournament_team_before_insert
  before insert on public.tournament_teams
  for each row execute function public.tournament_team_before_insert();

-- ─── Captains can't approve themselves ───────────────────────────────────────

create or replace function public.tournament_team_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if exists (select 1 from public.tournaments t where t.id = old.tournament_id and t.created_by = v_uid) then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.is_approved is distinct from old.is_approved
     or new.is_paid is distinct from old.is_paid
     or new.seed is distinct from old.seed
     or new.is_locked is distinct from old.is_locked
     or new.tournament_id is distinct from old.tournament_id then
    raise exception 'Only the organizer can change that' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.tournament_team_before_update() from public, anon, authenticated;

drop trigger if exists tournament_team_before_update on public.tournament_teams;
create trigger tournament_team_before_update
  before update on public.tournament_teams
  for each row execute function public.tournament_team_before_update();

-- ─── Joining a team ───────────────────────────────────────────────────────────

create or replace function public.tournament_member_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team public.tournament_teams%rowtype;
  v_t public.tournaments%rowtype;
  v_count integer;
begin
  -- Lock the team row so two joins can't both take the last roster spot.
  select * into v_team from public.tournament_teams where id = new.team_id for update;
  if not found then
    raise exception 'That team no longer exists' using errcode = 'P0002';
  end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if v_uid is null or v_uid = v_t.created_by or pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.tournament_registration_check(v_t, new.user_id);

  if v_team.status <> 'free_agent' then
    select count(*) into v_count from public.tournament_team_members where team_id = new.team_id;
    if v_count >= v_t.max_roster_size then
      raise exception 'This team''s roster is full (% players)', v_t.max_roster_size using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tournament_member_before_insert() from public, anon, authenticated;

drop trigger if exists tournament_member_before_insert on public.tournament_team_members;
create trigger tournament_member_before_insert
  before insert on public.tournament_team_members
  for each row execute function public.tournament_member_before_insert();

-- ─── Waitlist promotion ───────────────────────────────────────────────────────

create or replace function public.tournament_promote_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tournaments%rowtype;
  v_registered integer;
  v_next uuid;
begin
  if old.status <> 'registered' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status = 'registered' then
    return null;
  end if;
  select * into v_t from public.tournaments where id = old.tournament_id;
  -- Gone (cascading delete), not taking teams, or no cap: nothing to do.
  if not found or v_t.status <> 'published' or v_t.max_teams is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tournament_teams:' || old.tournament_id::text, 0));
  select count(*) into v_registered
  from public.tournament_teams where tournament_id = old.tournament_id and status = 'registered';
  if v_registered >= v_t.max_teams then
    return null;
  end if;
  select id into v_next
  from public.tournament_teams
  where tournament_id = old.tournament_id and status = 'waitlisted'
  order by created_at, id
  limit 1;
  if v_next is not null then
    update public.tournament_teams set status = 'registered' where id = v_next;
  end if;
  return null;
end;
$$;

revoke all on function public.tournament_promote_waitlist() from public, anon, authenticated;

drop trigger if exists tournament_promote_waitlist_on_delete on public.tournament_teams;
create trigger tournament_promote_waitlist_on_delete
  after delete on public.tournament_teams
  for each row execute function public.tournament_promote_waitlist();

drop trigger if exists tournament_promote_waitlist_on_update on public.tournament_teams;
create trigger tournament_promote_waitlist_on_update
  after update of status on public.tournament_teams
  for each row execute function public.tournament_promote_waitlist();
