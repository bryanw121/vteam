-- Undo 20261110230000_usage_sessions.sql exactly.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sample-app-online') then
    perform cron.unschedule('sample-app-online');
  end if;
  if exists (select 1 from cron.job where jobname = 'prune-app-online') then
    perform cron.unschedule('prune-app-online');
  end if;
end $$;
drop function if exists public.rollup_app_online(integer);
drop function if exists public.sample_app_online();
drop function if exists public.app_heartbeat(text, text, text, text, text);
drop table if exists public.app_online_daily;
drop table if exists public.app_online_samples;
drop table if exists public.app_sessions;
drop index if exists public.app_events_session_idx;
revoke insert (session_id, app_version) on public.app_events from anon, authenticated;
alter table public.app_events drop column if exists app_version;
alter table public.app_events drop column if exists session_id;
