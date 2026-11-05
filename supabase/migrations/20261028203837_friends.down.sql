-- Undo 20261028203837_friends.

drop function if exists public.get_friends_going(uuid[]);
drop function if exists public.set_best_friend(uuid, boolean);
drop function if exists public.remove_friend(uuid);
drop function if exists public.cancel_friend_request(uuid);
drop function if exists public.respond_friend_request(uuid, boolean);
drop function if exists public.send_friend_request(uuid);
drop function if exists public.friend_accept(uuid, uuid, uuid);
drop function if exists public.friend_pair_lock(uuid, uuid);

-- The old check would reject these rows.
delete from public.notifications where notification_type in ('friend_request', 'friend_accepted');
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted',
    'event_cancelled', 'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned',
    'join_request', 'request_approved', 'request_denied', 'tournament_team_invite',
    'tournament_join_request', 'tournament_join_accepted', 'tournament_join_declined',
    'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention',
    'event_reminder', 'late_dropout'
  ]::text[]));

drop table if exists public.friendships;
drop table if exists public.friend_requests;
