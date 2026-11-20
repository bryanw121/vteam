-- Court queue for open play (#333): who's on each court, who's next, winners stay. The host
-- (or a co-host) taps who won; everyone who can see the event, guests included, reads the
-- rotation live. Expand only.

create table public.event_court_queues (
  event_id   uuid primary key references public.events (id) on delete cascade,
  courts     smallint not null check (courts between 1 and 4),
  -- 'stay': the winner stays, up to stay_max wins in a row (null: always); 'both_off': both teams
  -- go to the back of the line after every game.
  rule       text not null default 'stay' check (rule in ('stay', 'both_off')),
  stay_max   smallint check (stay_max is null or stay_max between 1 and 5),
  -- { courts: [[a, b] | null, …], queue: [team, …], streaks: {team: wins}, games: [{court, winner, loser}], undo: […] }
  -- Teams are event team numbers (event_attendees / event_guests.team_number). Computed by the
  -- app (utils/courtQueue.ts); shape-checked by save_court_queue().
  state      jsonb not null,
  version    integer not null default 1,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint event_court_queues_rule_stay check (rule = 'stay' or stay_max is null),
  constraint event_court_queues_state_size check (octet_length(state::text) <= 32768)
);

comment on table public.event_court_queues is
  'Court queue for open play (#333): one row per event. Readable by anyone who can read events (guests too); written only by save_court_queue() (host or co-host, version-checked).';

alter table public.event_court_queues enable row level security;

create policy "Court queues are viewable by everyone"
  on public.event_court_queues for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.event_court_queues from anon, authenticated;

-- Save the rotation. p_expected is the version the caller started from (0 for a new queue):
-- another phone that saved first makes this raise PT409 (HTTP 409), and the app reloads.
-- Returns the saved row as JSON.
create or replace function public.save_court_queue(
  p_event_id uuid,
  p_courts integer,
  p_rule text,
  p_stay_max integer,
  p_state jsonb,
  p_expected integer,
  p_ended boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_host uuid;
  v_cancelled timestamptz;
  v_row public.event_court_queues;
  v_team jsonb;
  v_pair jsonb;
  v_teams integer[] := '{}';
  v_known integer[];
begin
  if uid is null then
    raise exception 'Sign in to run the courts' using errcode = '28000';
  end if;
  if p_event_id is null or p_state is null or p_expected is null then
    raise exception 'event, state and version are required' using errcode = '22004';
  end if;

  select e.created_by, e.cancelled_at into v_host, v_cancelled from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if uid is distinct from v_host and not exists (
    select 1 from public.event_cohosts c where c.event_id = p_event_id and c.user_id = uid
  ) then
    raise exception 'Only the host or a co-host can run the courts' using errcode = '42501';
  end if;
  if v_cancelled is not null then
    raise exception 'This event was cancelled' using errcode = 'P0001';
  end if;

  perform public.enforce_rate_limit('court_queue:' || uid::text, 120, 60);

  -- Shape: courts is an array of [team, team] or null (at most 4), queue an array of teams.
  if jsonb_typeof(p_state -> 'courts') is distinct from 'array' or jsonb_typeof(p_state -> 'queue') is distinct from 'array'
     or jsonb_array_length(p_state -> 'courts') not between 1 and 4 then
    raise exception 'Not a court queue' using errcode = '22023';
  end if;
  for v_pair in select * from jsonb_array_elements(p_state -> 'courts') loop
    if jsonb_typeof(v_pair) = 'null' then continue; end if;
    if jsonb_typeof(v_pair) <> 'array' or jsonb_array_length(v_pair) <> 2 then
      raise exception 'Not a court queue' using errcode = '22023';
    end if;
    for v_team in select * from jsonb_array_elements(v_pair) loop
      if jsonb_typeof(v_team) <> 'number' then raise exception 'Not a court queue' using errcode = '22023'; end if;
      v_teams := v_teams || (v_team #>> '{}')::integer;
    end loop;
  end loop;
  for v_team in select * from jsonb_array_elements(p_state -> 'queue') loop
    if jsonb_typeof(v_team) <> 'number' then raise exception 'Not a court queue' using errcode = '22023'; end if;
    v_teams := v_teams || (v_team #>> '{}')::integer;
  end loop;
  if cardinality(v_teams) < 2 or cardinality(v_teams) <> (select count(distinct t) from unnest(v_teams) t) then
    raise exception 'Each team can be in one place only' using errcode = '22023';
  end if;

  -- Every team must be one of the event's saved teams.
  select coalesce(array_agg(distinct t), '{}') into v_known from (
    select a.team_number as t from public.event_attendees a
     where a.event_id = p_event_id and a.status = 'attending' and a.team_number is not null
    union
    select g.team_number from public.event_guests g
     where g.event_id = p_event_id and g.status = 'attending' and g.team_number is not null
  ) teams;
  if not (v_teams <@ v_known) then
    raise exception 'Save the teams first: a team in the queue has no players' using errcode = '22023';
  end if;

  select * into v_row from public.event_court_queues q where q.event_id = p_event_id for update;
  if found then
    if v_row.version <> p_expected then
      raise exception 'Someone else changed the courts' using errcode = 'PT409';
    end if;
    update public.event_court_queues q
       set courts = p_courts, rule = p_rule, stay_max = p_stay_max, state = p_state,
           version = q.version + 1, updated_at = now(), updated_by = uid,
           ended_at = case when p_ended then coalesce(q.ended_at, now()) end
     where q.event_id = p_event_id
    returning * into v_row;
  else
    if p_expected <> 0 then
      raise exception 'Someone else changed the courts' using errcode = 'PT409';
    end if;
    insert into public.event_court_queues (event_id, courts, rule, stay_max, state, updated_by, ended_at)
    values (p_event_id, p_courts, p_rule, p_stay_max, p_state, uid, case when p_ended then now() end)
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.save_court_queue(uuid, integer, text, integer, jsonb, integer, boolean) from public, anon;
grant execute on function public.save_court_queue(uuid, integer, text, integer, jsonb, integer, boolean) to authenticated;

alter publication supabase_realtime add table public.event_court_queues;
