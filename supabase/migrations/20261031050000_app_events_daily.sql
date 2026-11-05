-- Daily totals for usage metrics that outlive the 180-day prune.
--
-- app_events keeps one row per event for 180 days (prune-app-events). Counts
-- were computed from those rows, so anything older silently dropped out of
-- every total. app_events_daily keeps one row per UTC day, event name and
-- platform, forever (a few hundred bytes per event type per day):
--
--   events   how many events that day
--   people   distinct people that day: user_id, else the device's anon_id.
--            Distinct per day only: summing it across days counts a person
--            once per day they were active, not once overall.
--
-- rollup_app_events(p_days) recomputes the last p_days completed UTC days
-- (today is left out until it's over) from app_events and upserts them, so a
-- missed run is caught up by the next one. The daily prune job now runs it
-- just before deleting, and the migration backfills every day still stored.
--
-- Owner-only: RLS on with no policies and no client grants, like the reads of
-- app_events. No UPDATE/DELETE/DROP at top level. Idempotent.
create table if not exists public.app_events_daily (
  day date not null,
  name text not null,
  platform text not null default 'unknown',
  events integer not null check (events >= 0),
  people integer not null check (people >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, name, platform)
);
alter table public.app_events_daily enable row level security;
revoke all on public.app_events_daily from anon, authenticated;

create or replace function public.rollup_app_events(p_days integer default 7)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  with today as (select (now() at time zone 'utc')::date as d),
  totals as (
    select (e.created_at at time zone 'utc')::date as day,
           e.name,
           coalesce(e.platform, 'unknown') as platform,
           count(*)::integer as events,
           count(distinct coalesce(e.user_id::text, e.anon_id))::integer as people
    from public.app_events e, today
    where e.created_at >= ((today.d - greatest(p_days, 1))::timestamp at time zone 'utc')
      and e.created_at < (today.d::timestamp at time zone 'utc')
    group by 1, 2, 3
  ),
  upserted as (
    insert into public.app_events_daily as t (day, name, platform, events, people, updated_at)
    select day, name, platform, events, people, now() from totals
    on conflict (day, name, platform) do update
      set events = excluded.events, people = excluded.people, updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::integer from upserted
$function$;
revoke execute on function public.rollup_app_events(integer) from public, anon, authenticated;

-- Backfill every completed day app_events still holds.
select public.rollup_app_events(181);

-- The daily job (03:17 UTC) rolls up first, then prunes, so no day is deleted
-- before it is counted.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-app-events') then
    perform cron.unschedule('prune-app-events');
  end if;
  perform cron.schedule(
    'prune-app-events',
    '17 3 * * *',
    $job$select public.rollup_app_events(); delete from public.app_events where created_at < now() - interval '180 days'$job$
  );
end $$;
