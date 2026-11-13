-- Undo 20261113010000_user_reports.sql exactly.
drop function if exists public.admin_resolve_report(uuid, text, text);
drop function if exists public.admin_reports(text);
drop function if exists public.report_user(uuid, text, uuid, text, text);

delete from public.notifications where notification_type in ('report_resolved', 'moderation_warning');
alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted',
    'event_cancelled', 'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned',
    'join_request', 'request_approved', 'request_denied', 'tournament_team_invite',
    'tournament_join_request', 'tournament_join_accepted', 'tournament_join_declined',
    'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention', 'event_reminder',
    'late_dropout', 'friend_request', 'friend_accepted', 'bring_item_uncovered'
  ]::text[]));

drop table if exists public.user_reports;
