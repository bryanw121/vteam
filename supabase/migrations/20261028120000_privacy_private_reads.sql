-- #99 part 1: narrow what signed-out visitors and other users can read.
--
-- Expand-safe on purpose: installed native builds (some still `select('*')`
-- from profiles) keep working, because no column they read disappears or
-- loses its grant. Private values move OUT of the publicly readable columns
-- into owner-only places, and triggers keep old clients' writes landing there.
-- A later contract PR can drop profiles.notification_prefs / is_admin and
-- event_attendees.denial_reason once no deployed build reads them.
--
--  1. profiles.notification_prefs -> user_settings.notification_prefs (owner-only RLS)
--  2. profiles.is_admin           -> app_admins (no client access), read by current_user_is_admin()
--  3. event_attendees.denial_reason -> event_attendee_denials (host, co-hosts, that attendee)
--  4. event_guests: signed-out visitors no longer read +1 names; headcounts
--     still work through event_guests_attending (no names)
--  5. cheers: signed-out visitors no longer see who gave a kudo (giver_id)
--  6. chat-images bucket private; only the uploader and members of a
--     conversation holding the image can read (signed URLs)

-- ─── 1. notification_prefs ───────────────────────────────────────────────────

alter table public.user_settings add column if not exists notification_prefs jsonb;

insert into public.user_settings (user_id, notification_prefs)
select p.id, p.notification_prefs
from public.profiles p
join auth.users u on u.id = p.id
where p.notification_prefs is distinct from '{"push": {}, "in_app": {}}'::jsonb
on conflict (user_id) do update set notification_prefs = excluded.notification_prefs, updated_at = now();

-- ─── 2. is_admin ─────────────────────────────────────────────────────────────

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policies: only SECURITY DEFINER functions and the service role read it.
revoke all on public.app_admins from anon, authenticated;

insert into public.app_admins (user_id)
select p.id from public.profiles p join auth.users u on u.id = p.id where p.is_admin
on conflict do nothing;

-- Admin checks read app_admins through current_user_is_admin() (from
-- 20261028170100_ads.sql, which already prefers app_admins when it exists).
-- No separate is_app_admin(): the only policy that used it ("Admins insert
-- clubs") was dropped by 20261031032200_drop_admin_club_insert_policy.sql.

-- Old clients may still write these columns: move a written value to its
-- private home and keep the public column at its default.
create or replace function public.profiles_keep_private_columns_private()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.notification_prefs is distinct from '{"push": {}, "in_app": {}}'::jsonb then
    if tg_op = 'INSERT' or new.notification_prefs is distinct from old.notification_prefs then
      insert into public.user_settings (user_id, notification_prefs)
      values (new.id, new.notification_prefs)
      on conflict (user_id) do update set notification_prefs = excluded.notification_prefs, updated_at = now();
    end if;
    new.notification_prefs := '{"push": {}, "in_app": {}}'::jsonb;
  end if;
  -- Admins live in app_admins; this column is never true again.
  new.is_admin := false;
  return new;
end;
$$;
revoke execute on function public.profiles_keep_private_columns_private() from public, anon, authenticated;

drop trigger if exists trg_profiles_keep_private_columns_private on public.profiles;
create trigger trg_profiles_keep_private_columns_private
  before insert or update on public.profiles
  for each row execute function public.profiles_keep_private_columns_private();

-- Fires the trigger above, which resets both columns.
update public.profiles
set notification_prefs = '{"push": {}, "in_app": {}}'::jsonb
where notification_prefs is distinct from '{"push": {}, "in_app": {}}'::jsonb or is_admin;

-- Notification triggers read the private copy (profiles is kept as a fallback
-- for the moment between this migration and the backfill above).
create or replace function public.notification_pref_enabled(p_user_id uuid, p_channel text, p_notification_type text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
  key text;
begin
  if p_user_id is null then
    return true;
  end if;
  select s.notification_prefs into v from public.user_settings s where s.user_id = p_user_id;
  if v is null then
    select p.notification_prefs into v from public.profiles p where p.id = p_user_id;
  end if;
  if v is null then
    return true;
  end if;
  key := v #>> array[p_channel, p_notification_type];
  if key is null or key = '' then
    return true;
  end if;
  return key::boolean;
end;
$function$;

-- ─── 3. denial_reason ────────────────────────────────────────────────────────

create table if not exists public.event_attendee_denials (
  event_id uuid not null,
  user_id uuid not null,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  -- Deferred so the BEFORE INSERT trigger below can record a reason for a row
  -- that is being inserted in the same statement.
  constraint event_attendee_denials_attendee_fkey foreign key (event_id, user_id)
    references public.event_attendees (event_id, user_id) on delete cascade
    deferrable initially deferred
);
alter table public.event_attendee_denials enable row level security;
revoke all on public.event_attendee_denials from anon, authenticated;
grant select on public.event_attendee_denials to authenticated;

drop policy if exists "Denial reason visible to host, co-hosts and the attendee" on public.event_attendee_denials;
create policy "Denial reason visible to host, co-hosts and the attendee" on public.event_attendee_denials
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.events e where e.id = event_attendee_denials.event_id and e.created_by = (select auth.uid()))
    or exists (select 1 from public.event_cohosts c where c.event_id = event_attendee_denials.event_id and c.user_id = (select auth.uid()))
  );

insert into public.event_attendee_denials (event_id, user_id, reason)
select a.event_id, a.user_id, left(btrim(a.denial_reason), 500)
from public.event_attendees a
where a.status = 'denied' and nullif(btrim(a.denial_reason), '') is not null
on conflict (event_id, user_id) do update set reason = excluded.reason;

create or replace function public.event_attendees_keep_denial_private()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'denied' and nullif(btrim(new.denial_reason), '') is not null then
    insert into public.event_attendee_denials (event_id, user_id, reason)
    values (new.event_id, new.user_id, left(btrim(new.denial_reason), 500))
    on conflict (event_id, user_id) do update set reason = excluded.reason, created_at = now();
  elsif tg_op = 'UPDATE' and new.status is distinct from 'denied' then
    delete from public.event_attendee_denials d where d.event_id = new.event_id and d.user_id = new.user_id;
  end if;
  new.denial_reason := null;
  return new;
end;
$$;
revoke execute on function public.event_attendees_keep_denial_private() from public, anon, authenticated;

drop trigger if exists trg_event_attendees_keep_denial_private on public.event_attendees;
create trigger trg_event_attendees_keep_denial_private
  before insert or update on public.event_attendees
  for each row execute function public.event_attendees_keep_denial_private();

update public.event_attendees set denial_reason = null where denial_reason is not null;

-- ─── 4. event_guests ─────────────────────────────────────────────────────────

-- +1 rows (with names) only for signed-in users.
drop policy if exists "Anyone can view guests" on public.event_guests;
create policy "Anyone can view guests" on public.event_guests
  for select to authenticated
  using (true);

-- Headcounts for everyone, without names. Not security_invoker: it has to
-- count rows that the base table's RLS now hides from signed-out visitors.
drop view if exists public.event_guests_attending;
create view public.event_guests_attending as
  select id, event_id, added_by, status, joined_at, team_number, team_pinned
  from public.event_guests
  where status = 'attending';
revoke all on public.event_guests_attending from anon, authenticated;
grant select on public.event_guests_attending to anon, authenticated, service_role;

-- ─── 5. cheers ───────────────────────────────────────────────────────────────

revoke select on public.cheers from anon;
grant select (id, event_id, receiver_id, cheer_type, created_at) on public.cheers to anon;

-- ─── 6. chat-images ──────────────────────────────────────────────────────────

-- Uploader, or a member of a conversation with a message whose sender uploaded
-- this object and that references it (new rows store the object path; older
-- rows store the former public URL).
create or replace function public.can_read_chat_image(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    split_part(p_name, '/', 1) = (select auth.uid())::text
    or exists (
      select 1
      from public.messages m
      join public.conversation_members cm
        on cm.conversation_id = m.conversation_id and cm.user_id = (select auth.uid())
      where m.sender_id::text = split_part(p_name, '/', 1)
        and (m.image_url = p_name or right(m.image_url, length(p_name) + 13) = '/chat-images/' || p_name)
    )
  )
$$;
revoke execute on function public.can_read_chat_image(text) from public, anon;
grant execute on function public.can_read_chat_image(text) to authenticated;

create index if not exists messages_image_url_idx on public.messages (image_url) where image_url is not null;

drop policy if exists chat_images_select_authenticated on storage.objects;
create policy chat_images_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-images' and public.can_read_chat_image(name));

update storage.buckets set public = false where id = 'chat-images';
