-- Undo the trophies + rule settings migration exactly.
drop function if exists public.complete_tournament(uuid, jsonb);
drop table if exists public.tournament_trophies;
alter table public.tournament_rules drop constraint if exists tournament_rules_tiebreakers_check;
alter table public.tournament_rules drop column if exists third_place_match;
alter table public.tournament_rules drop column if exists tiebreakers;
