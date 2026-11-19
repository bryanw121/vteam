-- Undo 20261119070000_division_fill_and_sets_won.sql: sets_won leaves every list, then the
-- four-key check and the column go back to how they were.
update public.tournament_rules set tiebreakers = array_remove(tiebreakers, 'sets_won') where 'sets_won' = any (tiebreakers);
update public.tournament_rules set tiebreakers = array['head_to_head', 'set_ratio', 'point_diff', 'points_for']::text[] where cardinality(tiebreakers) = 0;
alter table public.tournament_rules drop constraint if exists tournament_rules_tiebreakers_check;
alter table public.tournament_rules add constraint tournament_rules_tiebreakers_check
  check (
    cardinality(tiebreakers) between 1 and 4
    and tiebreakers <@ array['head_to_head', 'set_ratio', 'point_diff', 'points_for']::text[]
  );
alter table public.tournament_divisions drop column if exists fill_by;
