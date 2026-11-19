-- Tournament formats, step 2b: two additions the Texas AO format needs.
--
-- 1. Divisions filled by size. A division's from_place..to_place can count places in each
--    pool (the default: Platinum = every pool's 1st) or places in the overall ranking after
--    pool play (overall_rank: Platinum = the top 8, Gold = the next 16), which is how a
--    tournament with uneven pools fills brackets of a fixed size.
-- 2. A "sets won" tiebreaker for standings (pool play where every match is two sets).
--
-- contract: the tiebreakers check is replaced by a wider one (same four keys plus sets_won,
-- up to five entries), so every row and every deployed build that satisfied the old check
-- satisfies the new one.

alter table public.tournament_divisions
  add column if not exists fill_by text not null default 'pool_place'
    check (fill_by in ('pool_place', 'overall_rank'));

comment on column public.tournament_divisions.fill_by is
  'What from_place..to_place count: pool_place = finishing place in each pool; overall_rank = place in the overall ranking after pool play (a division of a fixed size).';

alter table public.tournament_rules drop constraint if exists tournament_rules_tiebreakers_check;
alter table public.tournament_rules add constraint tournament_rules_tiebreakers_check
  check (
    cardinality(tiebreakers) between 1 and 5
    and tiebreakers <@ array['head_to_head', 'set_ratio', 'sets_won', 'point_diff', 'points_for']::text[]
  );
