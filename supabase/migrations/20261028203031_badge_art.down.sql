-- Undo 20261028203031_badge_art: drop the table (policy and index go with it).
-- Stored PNGs in the badges bucket are left in place.
drop table if exists public.badge_art;
