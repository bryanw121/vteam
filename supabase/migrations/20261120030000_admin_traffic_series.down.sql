-- Undo 20261120030000_admin_traffic_series.sql.
drop function if exists public.admin_traffic_series(integer);
drop index if exists public.app_sessions_started_at_idx;
