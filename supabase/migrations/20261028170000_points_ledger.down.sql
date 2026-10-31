-- Undo 20261028170000_points_ledger.sql.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'award-event-points') then
    perform cron.unschedule('award-event-points');
  end if;
end $$;
drop function if exists public.award_event_points();
drop trigger if exists point_events_apply on public.point_events;
drop function if exists public.apply_point_event();
drop table if exists public.point_balances;
drop table if exists public.point_events;
