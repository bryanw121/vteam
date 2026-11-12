-- Hardening: every SECURITY DEFINER function gets a fixed search_path, and
-- EXECUTE is narrowed to the roles that actually call each one.
--
-- A SECURITY DEFINER function without a fixed search_path resolves unqualified
-- names through the caller's search_path, so a caller who can create objects
-- earlier on that path could make the function (running as its owner) use
-- them. `public, pg_temp` keeps the bodies working unchanged (they use
-- unqualified public names) and puts pg_temp last.
--
-- EXECUTE (the default grant is to PUBLIC, so anon too):
--   * trigger and cron functions: nobody calls them directly (EXECUTE is only
--     checked when a trigger is created, not when it fires) -> revoked from clients
--   * signed-in RPCs (chat, notifications): revoked from anon / PUBLIC, kept for authenticated
--   * is_conversation_member: only used by policies scoped to authenticated -> no anon
--   * notification_pref_enabled: only called inside definer triggers -> no clients
-- Unchanged on purpose: is_club_owner (anon evaluates it through the club_members
-- "Owners manage members" policy when browsing clubs), schema_fingerprint and
-- schema_pending_changes (the drift check calls them with the anon key),
-- get_email_by_username (handled by #102).

alter function public.auto_join_club_conversation() set search_path = public, pg_temp;
alter function public.create_club_conversation() set search_path = public, pg_temp;
alter function public.find_or_create_dm(uuid) set search_path = public, pg_temp;
alter function public.get_chat_unread_count() set search_path = public, pg_temp;
alter function public.get_my_conversations() set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.is_club_owner(uuid) set search_path = public, pg_temp;
alter function public.is_conversation_member(uuid) set search_path = public, pg_temp;
alter function public.mark_conversation_read(uuid) set search_path = public, pg_temp;
alter function public.notify_on_kudo_received() set search_path = public, pg_temp;
alter function public.notify_user_mentioned() set search_path = public, pg_temp;
alter function public.send_kudos_reminders() set search_path = public, pg_temp;

-- Trigger / event-trigger / cron functions: no client calls them.
revoke execute on function public.auto_join_club_conversation() from public, anon, authenticated;
revoke execute on function public.create_club_conversation() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.notify_on_kudo_received() from public, anon, authenticated;
revoke execute on function public.notify_user_mentioned() from public, anon, authenticated;
revoke execute on function public.add_club_owner_after_insert() from public, anon, authenticated;
revoke execute on function public.notify_on_event_announcement() from public, anon, authenticated;
revoke execute on function public.notify_on_event_material_change() from public, anon, authenticated;
revoke execute on function public.notify_on_waitlist_promoted() from public, anon, authenticated;
revoke execute on function public.send_kudos_reminders() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.notification_pref_enabled(uuid, text, text) from public, anon, authenticated;

-- Signed-in only.
revoke execute on function public.find_or_create_dm(uuid) from public, anon;
revoke execute on function public.get_chat_unread_count() from public, anon;
revoke execute on function public.get_my_conversations() from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.mark_all_notifications_read() from public, anon;
revoke execute on function public.mark_notification_read(uuid) from public, anon;
revoke execute on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.find_or_create_dm(uuid) to authenticated;
grant execute on function public.get_chat_unread_count() to authenticated;
grant execute on function public.get_my_conversations() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;
