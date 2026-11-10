-- Undo 20261110170000_profiles_guard_username.sql.
drop trigger if exists profiles_guard_username on public.profiles;
drop function if exists public.profiles_guard_username();
