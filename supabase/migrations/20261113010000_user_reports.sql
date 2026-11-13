-- Reports that reach someone (#243): "Report player" writes a real report the team reviews.
--
-- Expand only: one new table (no client access at all), three SECURITY DEFINER functions,
-- and a wider notification type check (report_resolved, moderation_warning).
--
-- Clients never read or write user_reports. report_user() is the only way in (signed-in only,
-- not yourself, 10 a day, one open report per reporter + person + context); it keeps a copy of
-- the reported message / comment / post text if the reporter can see it, so deleting the
-- message later doesn't erase the evidence. Admins list and resolve through admin_reports()
-- and admin_resolve_report(), which raise 42501 for everyone else.

create table public.user_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references public.profiles(id) on delete set null,
  target_id        uuid not null references public.profiles(id) on delete cascade,
  context_kind     text not null check (context_kind in ('profile', 'dm', 'message', 'event_comment', 'club_post')),
  context_id       uuid,
  context_snapshot text check (char_length(context_snapshot) <= 2000),
  reason           text not null check (reason in ('harassment', 'hate', 'spam', 'unsafe_play', 'fake_profile', 'other')),
  details          text check (char_length(details) <= 1000),
  status           text not null default 'open' check (status in ('open', 'dismissed', 'warned', 'suspended')),
  resolved_by      uuid references public.profiles(id) on delete set null,
  resolved_at      timestamptz,
  resolution_note  text check (char_length(resolution_note) <= 1000),
  created_at       timestamptz not null default now()
);
create index user_reports_open_idx on public.user_reports (created_at) where status = 'open';
create index user_reports_reporter_idx on public.user_reports (reporter_id);
create index user_reports_target_idx on public.user_reports (target_id);
create index user_reports_resolved_by_idx on public.user_reports (resolved_by);

alter table public.user_reports enable row level security;
revoke all on public.user_reports from anon, authenticated;

-- ── Notification types ──────────────────────────────────────────────────────

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted',
    'event_cancelled', 'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned',
    'join_request', 'request_approved', 'request_denied', 'tournament_team_invite',
    'tournament_join_request', 'tournament_join_accepted', 'tournament_join_declined',
    'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention', 'event_reminder',
    'late_dropout', 'friend_request', 'friend_accepted', 'bring_item_uncovered',
    'report_resolved', 'moderation_warning'
  ]::text[]));

-- ── Report ──────────────────────────────────────────────────────────────────

create or replace function public.report_user(
  p_target uuid,
  p_kind text,
  p_context_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_snapshot text;
  v_id uuid;
begin
  if uid is null then
    raise exception 'Sign in to report someone' using errcode = '28000';
  end if;
  if p_target is null or p_target = uid then
    raise exception 'You can''t report yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if p_kind is null or p_kind not in ('profile', 'dm', 'message', 'event_comment', 'club_post') then
    raise exception 'Unknown report context' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('harassment', 'hate', 'spam', 'unsafe_play', 'fake_profile', 'other') then
    raise exception 'Pick a reason' using errcode = '22023';
  end if;
  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'Details can be at most 1000 characters' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.user_reports r
     where r.reporter_id = uid and r.target_id = p_target and r.status = 'open'
       and r.context_kind = p_kind and r.context_id is not distinct from p_context_id
  ) then
    raise exception 'You already reported this. We''ll review it soon.' using errcode = 'P0001';
  end if;
  if not public.check_rate_limit('report:' || uid::text, 10, 86400) then
    raise exception 'Too many reports today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  -- Keep the reported text, but only what the reporter can see.
  if p_context_id is not null then
    if p_kind = 'message' then
      select m.content into v_snapshot from public.messages m
       where m.id = p_context_id and m.sender_id = p_target
         and exists (select 1 from public.conversation_members cm where cm.conversation_id = m.conversation_id and cm.user_id = uid);
    elsif p_kind = 'event_comment' then
      select c.body into v_snapshot from public.event_comments c
       where c.id = p_context_id and c.user_id = p_target;
    elsif p_kind = 'club_post' then
      select cp.body into v_snapshot from public.club_posts cp
       where cp.id = p_context_id and cp.created_by = p_target
         and exists (select 1 from public.club_members mm where mm.club_id = cp.club_id and mm.user_id = uid);
    end if;
  end if;

  insert into public.user_reports (reporter_id, target_id, context_kind, context_id, context_snapshot, reason, details)
  values (uid, p_target, p_kind, p_context_id, left(v_snapshot, 2000), p_reason, v_details)
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Admin ───────────────────────────────────────────────────────────────────

create or replace function public.admin_reports(p_status text default 'open')
returns table (
  id uuid, created_at timestamptz, status text, reason text, details text,
  context_kind text, context_id uuid, context_snapshot text,
  target_id uuid, target_username text, target_name text,
  reporter_id uuid, reporter_username text,
  resolved_at timestamptz, resolution_note text,
  target_open_reports integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
    select r.id, r.created_at, r.status, r.reason, r.details,
           r.context_kind, r.context_id, r.context_snapshot,
           r.target_id, t.username, nullif(btrim(concat_ws(' ', t.first_name, t.last_name)), ''),
           r.reporter_id, rp.username,
           r.resolved_at, r.resolution_note,
           (select count(*)::integer from public.user_reports o where o.target_id = r.target_id and o.status = 'open')
      from public.user_reports r
      left join public.profiles t on t.id = r.target_id
      left join public.profiles rp on rp.id = r.reporter_id
     where (p_status = 'all' or r.status = p_status)
     order by case when r.status = 'open' then r.created_at end asc nulls last, r.created_at desc
     limit 200;
end;
$$;

create or replace function public.admin_resolve_report(p_id uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.user_reports;
  v_status text;
begin
  if not public.current_user_is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  v_status := case p_action when 'dismiss' then 'dismissed' when 'warn' then 'warned' when 'suspend' then 'suspended' end;
  if v_status is null then
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  select * into r from public.user_reports where id = p_id for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if r.status <> 'open' then
    raise exception 'This report was already resolved' using errcode = 'P0001';
  end if;

  update public.user_reports
     set status = v_status, resolved_by = uid, resolved_at = now(),
         resolution_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '')
   where id = p_id;

  if v_status in ('warned', 'suspended') and r.reporter_id is not null then
    insert into public.notifications (user_id, notification_type, title, body, data)
    values (r.reporter_id, 'report_resolved', 'We acted on your report',
            'Thanks for keeping games friendly.', jsonb_build_object('deep_link', '/'));
  end if;
  if v_status = 'warned' then
    insert into public.notifications (user_id, notification_type, title, body, data)
    values (r.target_id, 'moderation_warning', 'A reminder about how we play',
            'Someone reported behavior that goes against vteam''s community rules. Please keep games and chats respectful; repeated reports can lead to your account being suspended.',
            jsonb_build_object('deep_link', '/terms'));
  end if;
end;
$$;

revoke execute on function public.report_user(uuid, text, uuid, text, text) from public, anon;
grant execute on function public.report_user(uuid, text, uuid, text, text) to authenticated;
revoke execute on function public.admin_reports(text) from public, anon;
grant execute on function public.admin_reports(text) to authenticated;
revoke execute on function public.admin_resolve_report(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;
