-- Undo 20261126060000_tournament_roster_rules (beta rollback only).
drop trigger if exists tournament_invitation_guard on public.tournament_team_invitations;
drop function if exists public.tournament_invitation_guard();
drop trigger if exists tournament_join_request_guard on public.tournament_team_join_requests;
drop function if exists public.tournament_join_request_guard();
drop policy if exists "invitee can join the inviting team" on public.tournament_team_members;
create policy "user can insert self as member" on public.tournament_team_members
  for insert with check (user_id = (select auth.uid()));
