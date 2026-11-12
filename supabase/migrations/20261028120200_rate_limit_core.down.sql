-- Undo 20261028120200_rate_limit_core.sql.
select cron.unschedule('prune-rate-limits') where exists (select 1 from cron.job where jobname = 'prune-rate-limits');
drop function if exists public.enforce_rate_limit(text, integer, integer);
drop function if exists public.check_rate_limit(text, integer, integer);
drop table if exists public.rate_limits;
