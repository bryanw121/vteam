-- #99 part 2: in-app account deletion.
--
-- Flow: the app shows get_account_deletion_preview() (what will be deleted and
-- what will be handed to whom, plus a hash of that plan). The delete-account
-- edge function checks the person signed in recently, then calls
-- delete_account(user, hash) with the service role. That one transaction locks
-- the person's profile, recomputes the plan, aborts if it differs from what was
-- shown, carries it out, and deletes the auth user (cascading to profiles and
-- everything keyed on it). Nothing is half-done: it all commits or nothing does.
--
-- Rules (preview and execution both come from account_deletion_plan):
--   clubs the person created, or where they are the only owner
--                              -> the earliest other OWNER (club_members.role) who is not
--                                 also being deleted; else the club is deleted with its
--                                 group chat, posts and tournaments (finished ones too)
--   tournaments they created   -> an owner of the tournament's club (same rule); else deleted
--   upcoming events they host  -> their earliest co-host; else cancelled (attendees get the
--                                 usual "event cancelled" notification)
--   past events they hosted    -> kept, host removed (events.created_by = null)
--   kudos they gave            -> kept for the recipients, giver removed (cheers.giver_id = null)
--   tournament captaincies     -> next team member, else the team has no captain
--   co-hosts they added        -> recorded as added by the co-host themself
--   tournament comments, team memberships, invitations, join requests -> deleted
--   everything else (messages, comments, RSVPs, settings, tokens...) goes with the
--   existing ON DELETE CASCADE / SET NULL foreign keys.

-- Kudos stay with the people who received them (the giver is never shown by name).
alter table public.cheers alter column giver_id drop not null;
alter table public.cheers drop constraint if exists kudos_giver_id_fkey;
alter table public.cheers add constraint kudos_giver_id_fkey
  foreign key (giver_id) references public.profiles(id) on delete set null;

-- True while another transaction is deleting this account: delete_account
-- holds a FOR UPDATE lock on the profile row. FOR KEY SHARE does not conflict
-- with ordinary profile updates, only with that lock, so SKIP LOCKED finds
-- nothing exactly when a deletion is in progress (or the profile is gone).
create or replace function public.account_is_being_deleted(p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return not exists (select 1 from public.profiles p where p.id = p_user for key share skip locked);
end;
$$;
revoke execute on function public.account_is_being_deleted(uuid) from public, anon, authenticated;

-- Earliest owner of a club other than p_user who is not being deleted.
create or replace function public.club_successor(p_club uuid, p_user uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select m.user_id from public.club_members m
    where m.club_id = p_club and m.role = 'owner' and m.user_id <> p_user
    order by m.joined_at, m.user_id
  loop
    if not public.account_is_being_deleted(r.user_id) then
      return r.user_id;
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function public.club_successor(uuid, uuid) from public, anon, authenticated;

create or replace function public.account_deletion_plan(p_user uuid)
returns jsonb
language plpgsql
volatile -- locks rows (skip-locked checks) to find successors
security definer
set search_path = ''
as $$
declare
  v_clubs jsonb;
  v_tournaments jsonb;
  v_events jsonb;
  v_past int;
  v_kudos int;
begin
  -- Clubs the person created or is the only owner of.
  with c as (
    select cl.id, cl.name, public.club_successor(cl.id, p_user) as successor
    from public.clubs cl
    where cl.created_by = p_user
       or (exists (select 1 from public.club_members m where m.club_id = cl.id and m.user_id = p_user and m.role = 'owner')
           and not exists (select 1 from public.club_members m where m.club_id = cl.id and m.user_id <> p_user and m.role = 'owner'))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name,
      'action', case when c.successor is null then 'delete' else 'transfer' end,
      'to', case when c.successor is null then null else jsonb_build_object(
        'id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name) end,
      'members', (select count(*) from public.club_members m where m.club_id = c.id and m.user_id <> p_user),
      'posts', (select count(*) from public.club_posts cp where cp.club_id = c.id),
      'tournaments', (select count(*) from public.tournaments t where t.club_id = c.id),
      'has_chat', exists (select 1 from public.conversations cv where cv.club_id = c.id)
    ) order by c.name, c.id), '[]'::jsonb)
  into v_clubs
  from c left join public.profiles p on p.id = c.successor;

  -- Tournaments: those the person created, plus every tournament in a club
  -- that is about to be deleted (they go with the club, whoever created them).
  with deleted_clubs as (
    select (x->>'id')::uuid as id, x->>'name' as name
    from jsonb_array_elements(v_clubs) x where x->>'action' = 'delete'
  ),
  t as (
    select tr.id, tr.title, tr.status, dc.name as club_name,
      case when dc.id is not null then null else public.club_successor(tr.club_id, p_user) end as successor
    from public.tournaments tr
    left join deleted_clubs dc on dc.id = tr.club_id
    where tr.created_by = p_user or dc.id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title, 'status', t.status,
      'action', case when t.successor is null then 'delete' else 'transfer' end,
      'with_club', t.club_name,
      'to', case when t.successor is null then null else jsonb_build_object(
        'id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name) end
    ) order by t.title, t.id), '[]'::jsonb)
  into v_tournaments
  from t left join public.profiles p on p.id = t.successor;

  -- Upcoming events they host: earliest co-host takes over, else cancelled.
  with e as (
    select ev.id, ev.title, ev.event_date,
      (select c.user_id from public.event_cohosts c
        where c.event_id = ev.id and c.user_id <> p_user and not public.account_is_being_deleted(c.user_id)
        order by c.added_at, c.user_id limit 1) as successor
    from public.events ev
    where ev.created_by = p_user and ev.cancelled_at is null and ev.event_date > (now() at time zone 'utc')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'event_date', e.event_date,
      'action', case when e.successor is null then 'cancel' else 'transfer' end,
      'to', case when e.successor is null then null else jsonb_build_object(
        'id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name) end
    ) order by e.event_date, e.id), '[]'::jsonb)
  into v_events
  from e left join public.profiles p on p.id = e.successor;

  select count(*) into v_past
  from public.events ev
  where ev.created_by = p_user and (ev.cancelled_at is not null or ev.event_date <= (now() at time zone 'utc'));

  select count(*) into v_kudos from public.cheers k where k.giver_id = p_user;

  return jsonb_build_object(
    'clubs', v_clubs, 'tournaments', v_tournaments, 'events', v_events,
    'past_events_kept', v_past, 'kudos_given_kept', v_kudos);
end;
$$;
revoke execute on function public.account_deletion_plan(uuid) from public, anon, authenticated;

-- What deleting the signed-in account would do (the confirm screen), with a
-- hash the app sends back so delete_account can refuse a stale confirmation.
create or replace function public.get_account_deletion_preview()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
begin
  if (select auth.uid()) is null then
    return null;
  end if;
  v_plan := public.account_deletion_plan((select auth.uid()));
  return v_plan || jsonb_build_object('hash', md5(v_plan::text));
end;
$$;
revoke execute on function public.get_account_deletion_preview() from public, anon;
grant execute on function public.get_account_deletion_preview() to authenticated;

-- Delete p_user's account in one transaction. Service role only (the
-- delete-account edge function, after its recent-sign-in check).
-- Raises 'account_deletion_plan_changed' (SQLSTATE P0409) when the plan no
-- longer matches p_plan_hash: the app shows the new plan and asks again.
create or replace function public.delete_account(p_user uuid, p_plan_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  x jsonb;
  r record;
  v_next uuid;
  v_left text;
begin
  if p_user is null or p_plan_hash is null then
    raise exception 'delete_account: user and plan hash are required';
  end if;

  -- Serialize with any other deletion of this account, and mark it as "being
  -- deleted" for concurrent plans (account_is_being_deleted).
  perform 1 from public.profiles where id = p_user for update;
  if not found then
    raise exception 'delete_account: no such account';
  end if;

  v_plan := public.account_deletion_plan(p_user);
  if md5(v_plan::text) <> p_plan_hash then
    raise exception using errcode = 'P0409', message = 'account_deletion_plan_changed';
  end if;

  for x in select * from jsonb_array_elements(v_plan->'clubs') loop
    if x->>'action' = 'transfer' then
      update public.clubs set created_by = (x->'to'->>'id')::uuid where id = (x->>'id')::uuid;
    else
      delete from public.clubs where id = (x->>'id')::uuid;
    end if;
  end loop;

  for x in select * from jsonb_array_elements(v_plan->'tournaments') loop
    if x->>'action' = 'transfer' then
      update public.tournaments set created_by = (x->'to'->>'id')::uuid where id = (x->>'id')::uuid;
    else
      delete from public.tournaments where id = (x->>'id')::uuid;
    end if;
  end loop;

  for x in select * from jsonb_array_elements(v_plan->'events') loop
    if x->>'action' = 'transfer' then
      update public.events set created_by = (x->'to'->>'id')::uuid where id = (x->>'id')::uuid;
      delete from public.event_cohosts where event_id = (x->>'id')::uuid and user_id = (x->'to'->>'id')::uuid;
    else
      update public.events set cancelled_at = now() where id = (x->>'id')::uuid and cancelled_at is null;
    end if;
  end loop;

  -- Past and cancelled events stay, without a host (events.created_by would
  -- otherwise cascade and delete them for everyone who played).
  update public.events set created_by = null where created_by = p_user;

  update public.event_cohosts set added_by = user_id where added_by = p_user;

  for r in select t.id from public.tournament_teams t where t.captain_user_id = p_user loop
    select m.user_id into v_next from public.tournament_team_members m
      where m.team_id = r.id and m.user_id <> p_user order by m.joined_at, m.user_id limit 1;
    update public.tournament_teams set captain_user_id = v_next where id = r.id;
    if v_next is not null then
      update public.tournament_team_members set is_captain = true where team_id = r.id and user_id = v_next;
    end if;
  end loop;

  delete from public.tournament_team_members where user_id = p_user;
  delete from public.tournament_team_invitations where inviter_id = p_user or invitee_id = p_user;
  delete from public.tournament_team_join_requests where requester_id = p_user;
  delete from public.tournament_comments where user_id = p_user;

  -- Every remaining FK to the person must cascade or set null; fail (and roll
  -- everything back) if a NO ACTION / RESTRICT one still points at them.
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1
      and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and c.confdeltype in ('a', 'r')
      and c.connamespace = 'public'::regnamespace
  loop
    execute format('select %I::text from %s where %I = $1 limit 1', r.col, r.tbl, r.col) into v_left using p_user;
    if v_left is not null then
      raise exception 'delete_account: %.% still references the user', r.tbl, r.col;
    end if;
  end loop;

  -- Last: the auth user. Cascades to profiles (and from there to everything
  -- keyed on the person) and to auth sessions / identities.
  delete from auth.users where id = p_user;

  return v_plan;
end;
$$;
revoke execute on function public.delete_account(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_account(uuid, text) to service_role;
