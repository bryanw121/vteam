-- Undo 20261028120000_privacy_private_reads.sql exactly, copying the moved
-- values back to their original columns first.

-- 6. chat-images
update storage.buckets set public = true where id = 'chat-images';
drop policy if exists chat_images_select_authenticated on storage.objects;
create policy chat_images_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-images');
drop index if exists public.messages_image_url_idx;
drop function if exists public.can_read_chat_image(text);

-- 5. cheers
revoke select (id, event_id, receiver_id, cheer_type, created_at) on public.cheers from anon;
grant select on public.cheers to anon;

-- 4. event_guests
drop view if exists public.event_guests_attending;
create view public.event_guests_attending with (security_invoker = true) as
  select id, event_id, added_by, first_name, last_name, status, joined_at
  from public.event_guests
  where status = 'attending';
grant all on public.event_guests_attending to anon, authenticated, service_role;
drop policy if exists "Anyone can view guests" on public.event_guests;
create policy "Anyone can view guests" on public.event_guests
  for select to public
  using (true);

-- 3. denial_reason
drop trigger if exists trg_event_attendees_keep_denial_private on public.event_attendees;
drop function if exists public.event_attendees_keep_denial_private();
update public.event_attendees a
set denial_reason = d.reason
from public.event_attendee_denials d
where d.event_id = a.event_id and d.user_id = a.user_id;
drop table if exists public.event_attendee_denials;

-- 1 + 2. profiles
drop trigger if exists trg_profiles_keep_private_columns_private on public.profiles;
drop function if exists public.profiles_keep_private_columns_private();
update public.profiles p
set notification_prefs = s.notification_prefs
from public.user_settings s
where s.user_id = p.id and s.notification_prefs is not null;
update public.profiles p set is_admin = true from public.app_admins a where a.user_id = p.id;

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
  select p.notification_prefs into v
  from public.profiles p
  where p.id = p_user_id;
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

drop table if exists public.app_admins;
alter table public.user_settings drop column if exists notification_prefs;
