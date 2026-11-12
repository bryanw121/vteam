-- Usage metrics, part 1: sessions, online now, and the session / app version on events.
--
-- Design: the "vteam usage metrics" doc (Nov 10). The app already records small events in
-- app_events. This adds:
--
--   app_sessions        one row per app open (session id from the app), written only by
--                       app_heartbeat(): who (user_id from the token, else the device id),
--                       platform, app version, started / last seen, the screen type now on.
--                       "Online now" = sessions heard from in the last 90 seconds.
--   app_online_samples  how many people were online, each minute (sample_app_online(), pg_cron
--                       every minute). Kept 30 days.
--   app_online_daily    each day's peak (and when) and average, in America/Chicago days
--                       (rollup_app_online(), nightly). Kept forever.
--   app_events          + session_id, + app_version (written by the client like the other
--                       descriptive columns).
--
-- Nobody reads these through the API: RLS on, no policies, no grants (admin functions come in
-- the next PR). app_heartbeat() is the only client entry point: it takes the user from
-- auth.uid(), only touches a session row whose device id matches, never moves a session to a
-- different signed-in user, and counts at most one heartbeat per session per 30 seconds.
--
-- Account deletion: app_sessions.user_id cascades (a deleted account's sessions go with it);
-- app_events.user_id is already ON DELETE SET NULL.
--
-- Additive only (new tables, nullable columns, functions, cron jobs). No UPDATE/DELETE/DROP at
-- top level. Idempotent.

-- app_events: which session an event belongs to, and the app build that sent it.
alter table public.app_events add column if not exists session_id text
  check (session_id is null or char_length(session_id) <= 64);
alter table public.app_events add column if not exists app_version text
  check (app_version is null or char_length(app_version) <= 32);
grant insert (session_id, app_version) on public.app_events to anon, authenticated;
create index if not exists app_events_session_idx on public.app_events (session_id) where session_id is not null;

create table if not exists public.app_sessions (
  id          text primary key check (id ~ '^[A-Za-z0-9-]{8,64}$'),
  user_id     uuid references auth.users (id) on delete cascade,
  anon_id     text not null check (char_length(anon_id) between 1 and 64),
  platform    text not null check (platform in ('ios', 'android', 'web')),
  app_version text check (app_version is null or char_length(app_version) <= 32),
  screen      text check (screen is null or char_length(screen) <= 80),
  heartbeats  integer not null default 1 check (heartbeats >= 1),
  started_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists app_sessions_last_seen_idx on public.app_sessions (last_seen);
create index if not exists app_sessions_user_idx on public.app_sessions (user_id, last_seen) where user_id is not null;
alter table public.app_sessions enable row level security;
revoke all on public.app_sessions from anon, authenticated;

create table if not exists public.app_online_samples (
  at          timestamptz primary key,
  online      integer not null check (online >= 0),
  signed_in   integer not null check (signed_in >= 0),
  by_platform jsonb not null default '{}'::jsonb
);
alter table public.app_online_samples enable row level security;
revoke all on public.app_online_samples from anon, authenticated;

create table if not exists public.app_online_daily (
  day        date primary key,
  peak       integer not null check (peak >= 0),
  peak_at    timestamptz,
  avg_online numeric(8, 2) not null default 0,
  samples    integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.app_online_daily enable row level security;
revoke all on public.app_online_daily from anon, authenticated;

-- The app calls this once a minute while it is open and visible. Bad input is ignored (no error),
-- so a broken or hostile client learns nothing and changes nothing.
create or replace function public.app_heartbeat(
  p_session text,
  p_anon text,
  p_platform text,
  p_version text default null,
  p_screen text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
begin
  if p_session is null or p_session !~ '^[A-Za-z0-9-]{8,64}$'
     or p_anon is null or char_length(p_anon) not between 1 and 64
     or p_platform is null or p_platform not in ('ios', 'android', 'web') then
    return;
  end if;
  insert into public.app_sessions as s (id, user_id, anon_id, platform, app_version, screen)
  values (p_session, uid, p_anon, p_platform, left(p_version, 32), left(p_screen, 80))
  on conflict (id) do update set
    last_seen   = now(),
    heartbeats  = s.heartbeats + 1,
    user_id     = coalesce(s.user_id, excluded.user_id),
    screen      = coalesce(excluded.screen, s.screen),
    app_version = coalesce(excluded.app_version, s.app_version)
  where s.anon_id = excluded.anon_id
    and (s.user_id is null or s.user_id = excluded.user_id)
    and s.last_seen < now() - interval '30 seconds';
end;
$function$;
revoke all on function public.app_heartbeat(text, text, text, text, text) from public;
grant execute on function public.app_heartbeat(text, text, text, text, text) to anon, authenticated;

-- How many people are online right now (one per account, else per device), as one sample.
create or replace function public.sample_app_online()
returns void
language sql
security definer
set search_path = ''
as $function$
  with live as (
    select platform, user_id, coalesce(user_id::text, anon_id) as who
    from public.app_sessions
    where last_seen > now() - interval '90 seconds'
  )
  insert into public.app_online_samples (at, online, signed_in, by_platform)
  select date_trunc('minute', now()),
         (select count(distinct who) from live)::integer,
         (select count(distinct user_id) from live)::integer,
         coalesce((select jsonb_object_agg(platform, n)
                   from (select platform, count(distinct who)::integer as n from live group by platform) p), '{}'::jsonb)
  on conflict (at) do nothing
$function$;
revoke all on function public.sample_app_online() from public, anon, authenticated;

-- Each completed day's peak and average (America/Chicago days: evenings stay in their own day),
-- recomputed for the last p_days so a missed night catches up.
create or replace function public.rollup_app_online(p_days integer default 7)
returns integer
language sql
security definer
set search_path = ''
as $function$
  with today as (select (now() at time zone 'America/Chicago')::date as d),
  days as (
    select (s.at at time zone 'America/Chicago')::date as day, s.at, s.online
    from public.app_online_samples s, today
    where s.at >= ((today.d - greatest(p_days, 1))::timestamp at time zone 'America/Chicago')
      and s.at < (today.d::timestamp at time zone 'America/Chicago')
  ),
  agg as (
    select day,
           max(online) as peak,
           (array_agg(at order by online desc, at))[1] as peak_at,
           round(avg(online)::numeric, 2) as avg_online,
           count(*)::integer as samples
    from days group by day
  ),
  upserted as (
    insert into public.app_online_daily as t (day, peak, peak_at, avg_online, samples, updated_at)
    select day, peak, peak_at, avg_online, samples, now() from agg
    on conflict (day) do update
      set peak = excluded.peak, peak_at = excluded.peak_at, avg_online = excluded.avg_online,
          samples = excluded.samples, updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::integer from upserted
$function$;
revoke all on function public.rollup_app_online(integer) from public, anon, authenticated;

-- Every minute: one sample. Nightly (09:23 UTC, ~3 AM in Austin): roll up the days, then prune
-- samples past 30 days and sessions past 180 days (as app_events).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sample-app-online') then
    perform cron.unschedule('sample-app-online');
  end if;
  perform cron.schedule('sample-app-online', '* * * * *', 'select public.sample_app_online()');
  if exists (select 1 from cron.job where jobname = 'prune-app-online') then
    perform cron.unschedule('prune-app-online');
  end if;
  perform cron.schedule(
    'prune-app-online',
    '23 9 * * *',
    $job$select public.rollup_app_online(); delete from public.app_online_samples where at < now() - interval '30 days'; delete from public.app_sessions where last_seen < now() - interval '180 days'$job$
  );
end $$;
