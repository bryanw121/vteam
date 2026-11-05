-- Undo 20261101090000_event_reminders.sql exactly.
select cron.unschedule(jobid) from cron.job where jobname = 'event-reminders';

drop trigger if exists trg_event_attendees_late_dropout on public.event_attendees;
drop function if exists public.notify_host_on_late_dropout();
drop function if exists public.send_event_reminders();
drop function if exists public.event_reminder_text(text, text, timestamptz, timestamptz);
drop index if exists public.events_event_date_idx;
drop table if exists public.event_reminder_log;
alter table public.user_settings drop column if exists reminder_lead_minutes;

-- Rows of the new types would violate the restored constraint.
delete from public.notifications where notification_type in ('event_reminder', 'late_dropout');
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted', 'event_cancelled',
    'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned', 'join_request', 'request_approved',
    'request_denied', 'tournament_team_invite', 'tournament_join_request', 'tournament_join_accepted',
    'tournament_join_declined', 'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention'
  ]::text[])
);
