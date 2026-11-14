-- Undo 20261114060000_tournament_divisions.sql exactly.
drop index if exists public.tournament_matches_division_id_idx;
alter table public.tournament_matches drop column if exists division_id;
drop table if exists public.tournament_days;
drop table if exists public.tournament_divisions;
alter table public.tournament_rules drop column if exists pool_sets_played;
alter table public.tournaments
  drop column if exists house_rule,
  drop column if exists warmup_minutes,
  drop column if exists pool_matches_per_team;
