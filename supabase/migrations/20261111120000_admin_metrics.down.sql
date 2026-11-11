-- Undo 20261111120000_admin_metrics.sql: the admin metrics functions (no tables or data).
drop function if exists public.admin_user_activity(uuid);
drop function if exists public.admin_users(text, text, integer, integer);
drop function if exists public.admin_retention(integer);
drop function if exists public.admin_online_now();
drop function if exists public.admin_metrics_overview(date, date);
drop function if exists public.app_version_key(text);
