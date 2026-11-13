-- Undo 20261113120000_new_game_alerts.sql (#170).
select cron.unschedule('new-game-alerts') where exists (select 1 from cron.job where jobname = 'new-game-alerts');

drop function if exists public.send_new_game_alerts();
drop function if exists public.new_game_alert_text(text, text, integer, text, text, timestamptz, integer, integer);
drop function if exists public.game_alert_matches(jsonb, text, text[], timestamptz);
drop function if exists public.set_club_game_alerts(uuid, boolean);
drop index if exists public.events_created_at_idx;
drop table if exists public.game_alert_log;

delete from public.notifications where notification_type = 'new_game';
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted', 'event_cancelled',
    'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned', 'join_request', 'request_approved',
    'request_denied', 'tournament_team_invite', 'tournament_join_request', 'tournament_join_accepted',
    'tournament_join_declined', 'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention',
    'event_reminder', 'late_dropout', 'friend_request', 'friend_accepted', 'bring_item_uncovered',
    'report_resolved', 'moderation_warning'
  ]::text[])
);

alter table public.club_members drop column if exists game_alerts;
alter table public.user_settings drop column if exists game_alerts;
