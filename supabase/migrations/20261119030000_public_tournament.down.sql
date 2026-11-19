-- Undo the public tournament read: its two functions and the saved copies.
drop function if exists public.get_public_tournament(uuid);
drop function if exists public.build_public_tournament(uuid);
drop table if exists public.tournament_public_snapshots;
