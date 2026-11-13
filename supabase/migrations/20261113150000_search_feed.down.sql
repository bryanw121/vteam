-- Undo 20261113150000_search_feed.sql (#176).
drop function if exists public.search_feed(text, text, text);
drop function if exists public.search_score(text, text);
drop index if exists public.events_title_trgm_idx;
drop index if exists public.events_location_trgm_idx;
drop index if exists public.external_sessions_title_trgm_idx;
drop index if exists public.external_sessions_venue_trgm_idx;
drop index if exists public.clubs_name_trgm_idx;
drop index if exists public.profiles_username_trgm_idx;
drop extension if exists pg_trgm;
