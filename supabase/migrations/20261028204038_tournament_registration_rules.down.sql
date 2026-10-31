-- Undo 20261028204038_tournament_registration_rules.sql exactly.
drop trigger if exists tournament_promote_waitlist_on_update on public.tournament_teams;
drop trigger if exists tournament_promote_waitlist_on_delete on public.tournament_teams;
drop trigger if exists tournament_member_before_insert on public.tournament_team_members;
drop trigger if exists tournament_team_before_update on public.tournament_teams;
drop trigger if exists tournament_team_before_insert on public.tournament_teams;
drop function if exists public.tournament_promote_waitlist();
drop function if exists public.tournament_member_before_insert();
drop function if exists public.tournament_team_before_update();
drop function if exists public.tournament_team_before_insert();
drop function if exists public.tournament_registration_check(public.tournaments, uuid);
