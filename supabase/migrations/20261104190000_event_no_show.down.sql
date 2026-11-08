-- Undo 20261104190000_event_no_show.sql: restore award_event_points() exactly
-- as it was, then drop set_no_show(), the guard and the three columns.

create or replace function public.award_event_points()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_rows integer := 0;
  tournament_rows integer := 0;
begin
  insert into public.point_events (user_id, amount, reason, event_id)
  select ea.user_id,
         case when exists (
           select 1 from public.event_tags et
           join public.tags t on t.id = et.tag_id
           where et.event_id = e.id and t.category = 'event_type' and t.name = 'Tournament'
         ) then 5 else 2 end,
         'event_attended',
         e.id
  from public.events e
  join public.event_attendees ea on ea.event_id = e.id and ea.status = 'attending'
  where e.cancelled_at is null
    and e.event_date + make_interval(mins => e.duration_minutes) <= now()
    -- someone added after the end did not attend
    and (ea.joined_at is null or ea.joined_at <= e.event_date + make_interval(mins => e.duration_minutes))
    and not exists (
      select 1 from public.point_events pe
      where pe.user_id = ea.user_id and pe.event_id = e.id and pe.reason = 'event_attended'
    )
  on conflict do nothing;
  get diagnostics event_rows = row_count;

  insert into public.point_events (user_id, amount, reason, tournament_id)
  select distinct m.user_id, 5, 'tournament_played', t.id
  from public.tournaments t
  join public.tournament_teams tt on tt.tournament_id = t.id and tt.status = 'registered' and tt.is_approved
  join public.tournament_team_members m on m.team_id = tt.id
  where t.status = 'completed'
    and t.cancelled_at is null
    and not exists (
      select 1 from public.point_events pe
      where pe.user_id = m.user_id and pe.tournament_id = t.id and pe.reason = 'tournament_played'
    )
  on conflict do nothing;
  get diagnostics tournament_rows = row_count;

  return event_rows + tournament_rows;
end;
$$;

revoke all on function public.award_event_points() from public, anon, authenticated;

drop function if exists public.set_no_show(uuid, uuid, boolean);
drop trigger if exists event_attendees_guard_no_show on public.event_attendees;
drop function if exists public.guard_no_show_columns();

alter table public.event_attendees
  drop column if exists no_show_marked_by,
  drop column if exists no_show_marked_at,
  drop column if exists no_show;
