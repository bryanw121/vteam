-- Tournament rosters, join requests and invites: who may change what (found by the
-- integration suite, e2e/integration/twoPeople.int.spec.ts).
--  1. "user can insert self as member" let any signed-in player put themselves on any
--     team's roster. It now needs a pending invite to that team: the one path that adds
--     yourself is accept_tournament_invite (SECURITY INVOKER). Captains and organizers
--     keep their own policies (registering your own team, approving a join request,
--     making teams).
--  2. A join request's answer (approved / declined) is the captain's or the organizer's;
--     the requester may only cancel it. Nobody moves a request to another team.
--  3. An invite: the invitee answers it (accepted / declined), the inviter, captain or
--     organizer may withdraw it, and nobody changes who or which team it is for.
-- contract: narrows a policy; every app path that adds a member runs as the captain,
-- the organizer, or the invitee through accept_tournament_invite, all still allowed.

drop policy if exists "user can insert self as member" on public.tournament_team_members;
create policy "invitee can join the inviting team" on public.tournament_team_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.tournament_team_invitations i
      where i.team_id = tournament_team_members.team_id and i.invitee_id = (select auth.uid()) and i.status = 'pending'
    )
  );

create or replace function public.tournament_join_request_guard() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_staff boolean;
begin
  -- Runs as the caller (security invoker), so current_user tells a player (authenticated)
  -- from server-side writers (definer functions, the service role), which are trusted.
  if v_uid is null or current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (new.tournament_id, new.team_id, new.requester_id) is distinct from (old.tournament_id, old.team_id, old.requester_id) then
    raise exception 'A join request can''t be moved' using errcode = '42501';
  end if;
  select exists (select 1 from public.tournaments t where t.id = old.tournament_id and t.created_by = v_uid)
      or exists (select 1 from public.tournament_teams tt where tt.id = old.team_id and tt.captain_user_id = v_uid)
    into v_staff;
  if new.status is distinct from old.status and not v_staff and new.status <> 'cancelled' then
    raise exception 'Only the captain or the organizer can answer a join request' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists tournament_join_request_guard on public.tournament_team_join_requests;
create trigger tournament_join_request_guard
  before update on public.tournament_team_join_requests
  for each row execute function public.tournament_join_request_guard();

create or replace function public.tournament_invitation_guard() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_staff boolean;
begin
  if v_uid is null or current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (new.tournament_id, new.team_id, new.invitee_id, new.inviter_id) is distinct from (old.tournament_id, old.team_id, old.invitee_id, old.inviter_id) then
    raise exception 'An invite can''t be changed to someone or somewhere else' using errcode = '42501';
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  if v_uid = old.invitee_id and new.status in ('accepted', 'declined') then
    return new;
  end if;
  select v_uid = old.inviter_id
      or exists (select 1 from public.tournaments t where t.id = old.tournament_id and t.created_by = v_uid)
      or exists (select 1 from public.tournament_teams tt where tt.id = old.team_id and tt.captain_user_id = v_uid)
    into v_staff;
  if v_staff and new.status in ('cancelled', 'withdrawn') then
    return new;
  end if;
  raise exception 'Only the invited player can answer an invite' using errcode = '42501';
end;
$$;
drop trigger if exists tournament_invitation_guard on public.tournament_team_invitations;
create trigger tournament_invitation_guard
  before update on public.tournament_team_invitations
  for each row execute function public.tournament_invitation_guard();
