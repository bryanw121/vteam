-- No-show flag (#151): hosts and co-hosts mark who didn't come; only those
-- players miss out on points.
--
--   event_attendees.no_show (+ no_show_marked_at / no_show_marked_by)
--       Readable like the rest of the row (the app shows it only to hosts,
--       co-hosts and the player). Written only by set_no_show(): the guard
--       trigger rejects any other insert or update that sets these columns.
--   set_no_show(event, user, value)
--       SECURITY DEFINER, authenticated only. The caller must host or co-host
--       the event, the event must not be cancelled, the target must be
--       attending, and now() must be between the start and end + 2 hours.
--   award_event_points()
--       Same signature and idempotency. The event branch now waits until
--       end + 2 hours (the flag window) and skips flagged players. The
--       tournament branch is unchanged.
--
-- Additive: the new columns have defaults, so the running app (which never
-- reads or writes them) is unaffected.

alter table public.event_attendees
  add column if not exists no_show boolean not null default false,
  add column if not exists no_show_marked_at timestamptz,
  add column if not exists no_show_marked_by uuid references public.profiles (id) on delete set null;

-- ─── Guard: the no-show columns change only through set_no_show() ────────────

create or replace function public.guard_no_show_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('vteam.no_show', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.no_show or new.no_show_marked_at is not null or new.no_show_marked_by is not null then
      raise exception 'no_show is set with set_no_show()' using errcode = '42501';
    end if;
  elsif (new.no_show, new.no_show_marked_at, new.no_show_marked_by)
        is distinct from (old.no_show, old.no_show_marked_at, old.no_show_marked_by)
    -- the marker's profile was deleted (on delete set null): let the FK action through
    and not (new.no_show_marked_by is null
             and new.no_show is not distinct from old.no_show
             and new.no_show_marked_at is not distinct from old.no_show_marked_at) then
    raise exception 'no_show is set with set_no_show()' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_no_show_columns() from public, anon, authenticated;

create trigger event_attendees_guard_no_show
  before insert or update on public.event_attendees
  for each row execute function public.guard_no_show_columns();

-- ─── set_no_show(): host / co-host, inside the window, attending target ─────

create or replace function public.set_no_show(p_event_id uuid, p_user_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_host uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_cancelled timestamptz;
  v_status text;
begin
  if uid is null then
    raise exception 'Sign in to mark a no-show' using errcode = '28000';
  end if;
  if p_event_id is null or p_user_id is null or p_value is null then
    raise exception 'event, player and value are required' using errcode = '22004';
  end if;

  -- events.event_date is `timestamp without time zone` holding UTC.
  select e.created_by,
         e.event_date at time zone 'UTC',
         (e.event_date at time zone 'UTC') + make_interval(mins => coalesce(e.duration_minutes, 120)),
         e.cancelled_at
    into v_host, v_start, v_end, v_cancelled
    from public.events e
   where e.id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if uid is distinct from v_host and not exists (
    select 1 from public.event_cohosts c where c.event_id = p_event_id and c.user_id = uid
  ) then
    raise exception 'Only the host or a co-host can mark a no-show' using errcode = '42501';
  end if;

  if v_cancelled is not null then
    raise exception 'This event was cancelled' using errcode = 'P0001';
  end if;

  if now() < v_start or now() >= v_end + interval '2 hours' then
    raise exception 'No-shows can be marked from the start of the event until 2 hours after it ends' using errcode = 'P0001';
  end if;

  select ea.status into v_status
    from public.event_attendees ea
   where ea.event_id = p_event_id and ea.user_id = p_user_id;
  if v_status is distinct from 'attending' then
    raise exception 'Only players who are going can be marked as a no-show' using errcode = 'P0001';
  end if;

  perform set_config('vteam.no_show', 'on', true);
  update public.event_attendees
     set no_show = p_value,
         no_show_marked_at = case when p_value then now() end,
         no_show_marked_by = case when p_value then uid end
   where event_id = p_event_id and user_id = p_user_id;
  perform set_config('vteam.no_show', 'off', true);
end;
$$;

revoke all on function public.set_no_show(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_no_show(uuid, uuid, boolean) to authenticated;

-- ─── award_event_points(): wait for the flag window, skip no-shows ──────────

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
    -- hosts can flag no-shows until 2 hours after the end (set_no_show)
    and e.event_date + make_interval(mins => e.duration_minutes) + interval '2 hours' <= now()
    and not ea.no_show
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
