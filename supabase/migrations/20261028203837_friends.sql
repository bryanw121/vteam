-- #15 Friends: mutual friendships (request, then accept or decline), a private
-- best-friend flag (at most 10), and the "friends going" lookup for events.
--
-- Expand only: two new tables, six functions, and two more values allowed by
-- the notifications type check.
--
-- Privacy
--   * friend_requests: only the two people on a PENDING request see it, so a
--     declined request is never shown to the person who sent it.
--   * friendships: one row per direction. Each person sees only their own
--     rows, so both see the friendship but only the owner sees their own
--     is_best_friend flag. Nobody else can list anyone's friends.
--   * Guests (anon) get no grant on either table and no EXECUTE on the RPCs.
--   * Clients never write either table: every change goes through the
--     SECURITY DEFINER RPCs below (fixed search_path, auth.uid() as the actor).
--
-- Limits (send_friend_request)
--   * 30 requests a day per sender.
--   * The same person at most 3 times a week, and not again within 7 days of
--     them declining.
--   * Nobody who has silenced you (chat_silences) gets requests from you.

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index if not exists friend_requests_one_pending_idx
  on public.friend_requests (requester_id, addressee_id) where status = 'pending';
create index if not exists friend_requests_addressee_pending_idx
  on public.friend_requests (addressee_id) where status = 'pending';
create index if not exists friend_requests_requester_created_idx
  on public.friend_requests (requester_id, created_at);

create table if not exists public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  is_best_friend boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists friendships_friend_id_idx on public.friendships (friend_id);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

revoke all on public.friend_requests from anon, authenticated;
revoke all on public.friendships from anon, authenticated;
grant select on public.friend_requests to authenticated;
grant select on public.friendships to authenticated;

drop policy if exists friend_requests_select_pending_own on public.friend_requests;
create policy friend_requests_select_pending_own on public.friend_requests
  for select to authenticated
  using (status = 'pending' and (select auth.uid()) in (requester_id, addressee_id));

drop policy if exists friendships_select_own on public.friendships;
create policy friendships_select_own on public.friendships
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ─── Notifications: two more types ───────────────────────────────────────────

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted',
    'event_cancelled', 'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned',
    'join_request', 'request_approved', 'request_denied', 'tournament_team_invite',
    'tournament_join_request', 'tournament_join_accepted', 'tournament_join_declined',
    'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention',
    'event_reminder', 'late_dropout',
    'friend_request', 'friend_accepted'
  ]::text[]));

-- ─── Helpers (not callable by clients) ───────────────────────────────────────

-- Serialises every change to one pair, so two people requesting each other at
-- the same moment can't both insert, and accept can't race cancel.
create or replace function public.friend_pair_lock(p_a uuid, p_b uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('friend:' || least(p_a, p_b)::text || ':' || greatest(p_a, p_b)::text, 0));
$$;

-- Accepts a pending request (caller holds the pair lock): both friendship
-- rows, the request closed, the requester notified, the addressee's request
-- notification marked read.
create or replace function public.friend_accept(p_request_id uuid, p_requester uuid, p_addressee uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  update public.friend_requests
     set status = 'accepted', responded_at = now()
   where id = p_request_id and status = 'pending';

  insert into public.friendships (user_id, friend_id)
  values (p_requester, p_addressee), (p_addressee, p_requester)
  on conflict do nothing;

  update public.notifications
     set read_at = now()
   where user_id = p_addressee and notification_type = 'friend_request'
     and data->>'request_id' = p_request_id::text and read_at is null;

  if public.notification_pref_enabled(p_requester, 'in_app', 'friend_accepted') then
    select coalesce(nullif(btrim(p.first_name), ''), p.username, 'Someone') into v_name
      from public.profiles p where p.id = p_addressee;
    insert into public.notifications (user_id, notification_type, title, body, data)
    values (
      p_requester, 'friend_accepted', 'Friend request accepted',
      left(coalesce(v_name, 'Someone'), 60) || ' accepted your friend request',
      jsonb_build_object('user_id', p_addressee, 'deep_link', '/profile/' || p_addressee::text)
    );
  end if;
end;
$$;

revoke execute on function public.friend_pair_lock(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.friend_accept(uuid, uuid, uuid) from public, anon, authenticated;

-- ─── RPCs ────────────────────────────────────────────────────────────────────
-- Each returns the caller's relationship to the other person afterwards:
-- 'none' | 'requested' (I asked them) | 'friends'.

create or replace function public.send_friend_request(p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_reverse uuid;
  v_request uuid;
  v_name text;
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '28000';
  end if;
  if p_user_id is null or p_user_id = v_me or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'invalid user' using errcode = '22023';
  end if;

  perform public.friend_pair_lock(v_me, p_user_id);

  if exists (select 1 from public.friendships f where f.user_id = v_me and f.friend_id = p_user_id) then
    return 'friends';
  end if;
  if exists (select 1 from public.friend_requests r
              where r.requester_id = v_me and r.addressee_id = p_user_id and r.status = 'pending') then
    return 'requested';
  end if;

  -- They already asked me: asking back accepts.
  select r.id into v_reverse from public.friend_requests r
   where r.requester_id = p_user_id and r.addressee_id = v_me and r.status = 'pending';
  if v_reverse is not null then
    perform public.friend_accept(v_reverse, p_user_id, v_me);
    return 'friends';
  end if;

  if exists (select 1 from public.chat_silences s where s.user_id = p_user_id and s.silenced_user_id = v_me) then
    raise exception 'friend request not allowed' using errcode = '42501';
  end if;

  if (select count(*) from public.friend_requests r
       where r.requester_id = v_me and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'friend request limit reached' using errcode = 'PT429';
  end if;
  if (select count(*) from public.friend_requests r
       where r.requester_id = v_me and r.addressee_id = p_user_id and r.created_at > now() - interval '7 days') >= 3
     or exists (select 1 from public.friend_requests r
                 where r.requester_id = v_me and r.addressee_id = p_user_id
                   and r.status = 'declined' and r.responded_at > now() - interval '7 days') then
    raise exception 'friend request limit reached' using errcode = 'PT429';
  end if;

  insert into public.friend_requests (requester_id, addressee_id)
  values (v_me, p_user_id)
  returning id into v_request;

  if public.notification_pref_enabled(p_user_id, 'in_app', 'friend_request') then
    select coalesce(nullif(btrim(p.first_name), ''), p.username, 'Someone') into v_name
      from public.profiles p where p.id = v_me;
    insert into public.notifications (user_id, notification_type, title, body, data)
    values (
      p_user_id, 'friend_request', 'New friend request',
      left(coalesce(v_name, 'Someone'), 60) || ' sent you a friend request',
      jsonb_build_object('request_id', v_request, 'user_id', v_me, 'deep_link', '/settings/friends')
    );
  end if;
  return 'requested';
end;
$$;

create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_requester uuid;
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '28000';
  end if;
  select r.requester_id into v_requester from public.friend_requests r
   where r.id = p_request_id and r.addressee_id = v_me and r.status = 'pending';
  if v_requester is null then
    raise exception 'friend request not found' using errcode = 'P0002';
  end if;

  perform public.friend_pair_lock(v_me, v_requester);
  -- Re-check under the lock: it may have been cancelled meanwhile.
  if not exists (select 1 from public.friend_requests r where r.id = p_request_id and r.status = 'pending') then
    raise exception 'friend request not found' using errcode = 'P0002';
  end if;

  if coalesce(p_accept, false) then
    perform public.friend_accept(p_request_id, v_requester, v_me);
    return 'friends';
  end if;

  update public.friend_requests set status = 'declined', responded_at = now() where id = p_request_id;
  update public.notifications
     set read_at = now()
   where user_id = v_me and notification_type = 'friend_request'
     and data->>'request_id' = p_request_id::text and read_at is null;
  return 'none';
end;
$$;

create or replace function public.cancel_friend_request(p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_request uuid;
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '28000';
  end if;
  if p_user_id is null then
    raise exception 'invalid user' using errcode = '22023';
  end if;
  perform public.friend_pair_lock(v_me, p_user_id);

  update public.friend_requests
     set status = 'cancelled', responded_at = now()
   where requester_id = v_me and addressee_id = p_user_id and status = 'pending'
  returning id into v_request;

  -- Take back the unread notification so they don't open a request that is gone.
  if v_request is not null then
    delete from public.notifications
     where user_id = p_user_id and notification_type = 'friend_request'
       and data->>'request_id' = v_request::text and read_at is null;
  end if;

  if exists (select 1 from public.friendships f where f.user_id = v_me and f.friend_id = p_user_id) then
    return 'friends';
  end if;
  return 'none';
end;
$$;

create or replace function public.remove_friend(p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '28000';
  end if;
  if p_user_id is null then
    raise exception 'invalid user' using errcode = '22023';
  end if;
  perform public.friend_pair_lock(v_me, p_user_id);
  delete from public.friendships
   where (user_id = v_me and friend_id = p_user_id)
      or (user_id = p_user_id and friend_id = v_me);
  return 'none';
end;
$$;

create or replace function public.set_best_friend(p_user_id uuid, p_best boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '28000';
  end if;
  -- One best-friend change at a time per person, so the cap holds.
  perform pg_advisory_xact_lock(hashtextextended('best-friend:' || v_me::text, 0));

  if not exists (select 1 from public.friendships f where f.user_id = v_me and f.friend_id = p_user_id) then
    raise exception 'not friends' using errcode = 'P0002';
  end if;
  if coalesce(p_best, false)
     and not exists (select 1 from public.friendships f
                      where f.user_id = v_me and f.friend_id = p_user_id and f.is_best_friend)
     and (select count(*) from public.friendships f where f.user_id = v_me and f.is_best_friend) >= 10 then
    raise exception 'best friend limit reached' using errcode = '23514';
  end if;

  update public.friendships
     set is_best_friend = coalesce(p_best, false)
   where user_id = v_me and friend_id = p_user_id;
  return coalesce(p_best, false);
end;
$$;

-- Friends of the caller who are attending the given events, best friends
-- first. SECURITY INVOKER: friendships RLS limits it to the caller's own rows;
-- attendance and profiles are already public.
create or replace function public.get_friends_going(p_event_ids uuid[])
returns table (event_id uuid, user_id uuid, username text, first_name text, avatar_url text, is_best_friend boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select ea.event_id, f.friend_id, p.username, p.first_name, p.avatar_url, f.is_best_friend
  from public.friendships f
  join public.event_attendees ea
    on ea.user_id = f.friend_id and ea.status = 'attending' and ea.event_id = any (p_event_ids)
  join public.profiles p on p.id = f.friend_id
  where f.user_id = (select auth.uid())
    and cardinality(p_event_ids) <= 500
  order by ea.event_id, f.is_best_friend desc, ea.joined_at;
$$;

revoke execute on function public.send_friend_request(uuid) from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.cancel_friend_request(uuid) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
revoke execute on function public.set_best_friend(uuid, boolean) from public, anon;
revoke execute on function public.get_friends_going(uuid[]) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.set_best_friend(uuid, boolean) to authenticated;
grant execute on function public.get_friends_going(uuid[]) to authenticated;
