-- Undo 20261112190000_event_bring_items.sql exactly.

-- send_event_reminders() as it was before (no "You're bringing" line, no host alert).
create or replace function public.send_event_reminders()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  sent integer;
begin
  with due as (
    select ea.event_id, ea.user_id, e.title, e.location, (e.event_date at time zone 'UTC') as starts_at
    from public.event_attendees ea
    join public.events e on e.id = ea.event_id
    left join public.user_settings us on us.user_id = ea.user_id
    cross join lateral (select make_interval(mins => coalesce(us.reminder_lead_minutes, 120)) as lead) l
    where ea.status = 'attending'
      and e.cancelled_at is null
      and e.event_date > (now() at time zone 'UTC')
      and e.event_date <= (now() at time zone 'UTC') + interval '1 day'
      and (e.event_date at time zone 'UTC') <= now() + l.lead
      -- Joined before the window opened: no reminder right after joining.
      and coalesce(ea.joined_at at time zone 'UTC', '-infinity'::timestamptz) <= (e.event_date at time zone 'UTC') - l.lead
      and not exists (
        select 1 from public.event_reminder_log r where r.event_id = ea.event_id and r.user_id = ea.user_id
      )
      and public.notification_pref_enabled(ea.user_id, 'in_app', 'event_reminder')
  ),
  logged as (
    insert into public.event_reminder_log (event_id, user_id)
    select event_id, user_id from due
    on conflict do nothing
    returning event_id, user_id
  )
  insert into public.notifications (user_id, notification_type, title, body, data)
  select d.user_id, 'event_reminder', t.title, t.body,
         jsonb_build_object('event_id', d.event_id, 'deep_link', '/event/' || d.event_id::text)
  from due d
  join logged g on g.event_id = d.event_id and g.user_id = d.user_id
  cross join lateral public.event_reminder_text(d.title, d.location, d.starts_at, now()) t;

  get diagnostics sent = row_count;
  return sent;
end;
$function$;
revoke execute on function public.send_event_reminders() from public, anon, authenticated;

drop trigger if exists event_attendees_release_bring_claims on public.event_attendees;
drop function if exists public.release_bring_claims_on_leave();
drop function if exists public.release_bring_item(uuid);
drop function if exists public.claim_bring_item(uuid, integer);
drop function if exists public.save_event_bring_items(uuid, jsonb);
drop function if exists public.get_event_bring_list(uuid);

delete from public.notifications where notification_type = 'bring_item_uncovered';
alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted',
    'event_cancelled', 'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned',
    'join_request', 'request_approved', 'request_denied', 'tournament_team_invite',
    'tournament_join_request', 'tournament_join_accepted', 'tournament_join_declined',
    'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention', 'event_reminder',
    'late_dropout', 'friend_request', 'friend_accepted'
  ]::text[]));

alter table public.user_event_templates drop column if exists bring_items;

drop table if exists public.event_bring_alert_log;
drop table if exists public.event_bring_claims;
drop table if exists public.event_bring_items;
