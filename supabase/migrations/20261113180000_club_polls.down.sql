-- Undo 20261113180000_club_polls.sql (#175).
drop function if exists public.link_poll_event(uuid, uuid);
drop function if exists public.vote_club_poll(uuid, uuid[]);
drop function if exists public.create_club_poll(uuid, text, text, jsonb, boolean, timestamptz, boolean);

-- Poll posts go with their polls (the post rows were created for them).
delete from public.club_posts p where exists (select 1 from public.club_polls cp where cp.post_id = p.id);
drop table if exists public.club_poll_votes;
drop table if exists public.club_poll_options;
drop table if exists public.club_polls;

delete from public.notifications where notification_type = 'club_poll';
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted', 'event_cancelled',
    'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned', 'join_request', 'request_approved',
    'request_denied', 'tournament_team_invite', 'tournament_join_request', 'tournament_join_accepted',
    'tournament_join_declined', 'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention',
    'event_reminder', 'late_dropout', 'friend_request', 'friend_accepted', 'bring_item_uncovered',
    'report_resolved', 'moderation_warning', 'new_game'
  ]::text[])
);
