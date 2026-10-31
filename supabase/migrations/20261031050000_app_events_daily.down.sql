-- Undo 20261031050000_app_events_daily: the prune job goes back to deleting
-- only, and the daily totals table and its function are removed.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-app-events') then
    perform cron.unschedule('prune-app-events');
  end if;
  perform cron.schedule(
    'prune-app-events',
    '17 3 * * *',
    $job$delete from public.app_events where created_at < now() - interval '180 days'$job$
  );
end $$;
drop function if exists public.rollup_app_events(integer);
drop table if exists public.app_events_daily;
