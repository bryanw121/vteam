-- Undo 20261109120000_external_programs.sql exactly.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ingest-schelagg-programs') then
    perform cron.unschedule('ingest-schelagg-programs');
  end if;
end;
$$;
drop function if exists public.ingest_schelagg_programs();
drop function if exists public.schelagg_safe_date(text);
drop table if exists public.external_programs;
