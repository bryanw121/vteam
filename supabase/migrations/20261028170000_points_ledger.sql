-- Points (#4): a ledger of point changes plus a maintained per-user balance.
--
--   point_events    append-only ledger. One row per change: +2 / +5 for
--                   attending, later negative rows for spending (reason
--                   'redeem_ad_free'). Written only by SECURITY DEFINER server
--                   functions: clients have no INSERT/UPDATE/DELETE grant.
--                   unique (user_id, event_id, reason) and
--                   unique (user_id, tournament_id, reason) make awards
--                   idempotent: an event can never award a user twice.
--   point_balances  user_id -> balance, kept by an AFTER INSERT trigger on the
--                   ledger, so a profile reads its total with one PK lookup.
--                   balance >= 0 is a CHECK, so a spend that would go negative
--                   fails and rolls back its ledger row. Public (guests see
--                   points on profiles), read-only for clients.
--
-- Awards (award_event_points(), pg_cron every 15 minutes, idempotent):
--   events       once event_date + duration_minutes has passed (and the event
--                is not cancelled), every attendee whose status is still
--                'attending' gets 5 points if the event is tagged Tournament
--                (tags.category = 'event_type'), otherwise 2 (Open Play and
--                untagged events). Waitlisted, requested and denied attendees
--                get nothing; people who left have no row and get nothing.
--   tournaments  once a tournament is 'completed' (not cancelled), members of
--                approved, registered teams get 5 points.
--   Past events are awarded on the first run (people really attended them).
--
-- Harmless on beta: beta has no real users, so the same cron job runs there
-- (the drift check needs the job on both projects) and at most awards the e2e
-- accounts.
--
-- The ledger is append-only: there is no delete trigger, so deleting rows
-- (only possible as the owner, e.g. a cascading account deletion, which also
-- deletes the balance row) never re-computes or blocks on the balance.

create table if not exists public.point_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null check (reason ~ '^[a-z][a-z0-9_]{0,63}$'),
  event_id uuid references public.events (id) on delete set null,
  tournament_id uuid references public.tournaments (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint point_events_once_per_event unique (user_id, event_id, reason),
  constraint point_events_once_per_tournament unique (user_id, tournament_id, reason)
);

create index if not exists point_events_event_id_idx on public.point_events (event_id) where event_id is not null;
create index if not exists point_events_tournament_id_idx on public.point_events (tournament_id) where tournament_id is not null;

create table if not exists public.point_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.point_events enable row level security;
alter table public.point_balances enable row level security;

-- Read-only for clients. Supabase grants everything on new public tables by
-- default, so revoke first.
revoke all on public.point_events from anon, authenticated;
revoke all on public.point_balances from anon, authenticated;
grant select on public.point_events to authenticated;
grant select on public.point_balances to anon, authenticated;

drop policy if exists "Users read their own point history" on public.point_events;
create policy "Users read their own point history" on public.point_events
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Anyone reads point balances" on public.point_balances;
create policy "Anyone reads point balances" on public.point_balances
  for select to anon, authenticated
  using (true);

-- Keep point_balances in step with the ledger.
create or replace function public.apply_point_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.point_balances (user_id, balance, updated_at)
  values (new.user_id, new.amount, now())
  on conflict (user_id) do update
    set balance = public.point_balances.balance + excluded.balance,
        updated_at = now();
  return null;
end;
$$;

revoke all on function public.apply_point_event() from public, anon, authenticated;

drop trigger if exists point_events_apply on public.point_events;
create trigger point_events_apply
  after insert on public.point_events
  for each row execute function public.apply_point_event();

-- The award pass. Returns how many ledger rows it inserted.
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

comment on function public.award_event_points() is
  'Awards attendance points (2 open play / 5 tournament) for ended events and completed tournaments. Idempotent; run by pg_cron award-event-points.';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'award-event-points') then
    perform cron.unschedule('award-event-points');
  end if;
  perform cron.schedule('award-event-points', '7,22,37,52 * * * *', $job$select public.award_event_points()$job$);
end $$;
