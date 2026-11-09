-- Leagues and tournaments run outside vteam, from Schelagg's public programs feed (#212).
--
-- vteam's tenet: data about volleyball events outside vteam comes from Schelagg, and only
-- from its public feeds. Schelagg (github.com/bryanw121/schelagg) has no credentials here
-- and never writes here; this database pulls https://bryanw121.github.io/schelagg/data/programs.json,
-- which Schelagg rebuilds twice a day from each organizer's sign-up page (ACES, Austin Sports &
-- Social Club, Meanwhile, NAGVA's Texas tournaments, Reclub competitions).
--
-- ingest_schelagg_programs() keeps volleyball rows, upserts external_programs and deletes rows
-- no longer in the feed (Schelagg drops a row once its deadline or last day passes).
-- Safety, as ingest_schelagg_feed():
--   - fixed URL, no parameters; EXECUTE revoked from every client role (only pg_cron runs it);
--   - a feed older than 18 hours is not ingested (rows then age out of the app by checked_at);
--   - a feed with no volleyball rows deletes nothing;
--   - only https sign-up and source links are stored.

create extension if not exists http with schema extensions;

create table if not exists public.external_programs (
  id                    text primary key,          -- Schelagg's id, e.g. 'aces-<uuid>', 'nagva-<id>'
  source_id             text not null,              -- reader: 'aces', 'leaguelab', 'nagva', 'reclub'
  kind                  text not null check (kind in ('league', 'tournament')),
  surface               text check (surface in ('indoor', 'sand', 'grass')),
  region                text,                       -- Schelagg region id ('austin'); null outside every region
  state                 text,                       -- 'TX'
  series                text,                       -- 'nagva' or null
  org                   text not null,              -- who runs it: 'ACES', 'NAGVA', ...
  title                 text not null,
  venue                 text,
  city                  text,
  address               text,
  lat                   double precision,
  lng                   double precision,
  format                text,
  divisions             jsonb not null default '[]'::jsonb, -- [{ name, cap?, confirmed? }]: counts only
  starts_on             date,
  ends_on               date,
  weekdays              text[] not null default '{}',
  registration_opens    date,
  registration_deadline date,
  waitlist_on           date,
  team_price            text,                       -- display text: '$400–500'
  individual_price      text,
  price_note            text,                       -- 'Early bird'
  price_changes_on      date,                       -- last day at the current price
  status                text check (status in ('open', 'waitlist', 'full', 'closed')),
  signup_url            text,
  source_url            text,
  checked_at            timestamptz,                -- when Schelagg last read the organizer's page
  updated_at            timestamptz not null default now()
);

create index if not exists external_programs_starts_on_idx on public.external_programs (starts_on);

alter table public.external_programs enable row level security;

-- Public listings: guests and members read them. No write policies: only the ingest changes rows.
drop policy if exists "external_programs are public" on public.external_programs;
create policy "external_programs are public"
  on public.external_programs for select
  to anon, authenticated
  using (true);

create or replace function public.ingest_schelagg_programs()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  feed_url constant text := 'https://bryanw121.github.io/schelagg/data/programs.json';
  res extensions.http_response;
  feed jsonb;
  run_at timestamptz := now();
  n integer;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  select * into res from extensions.http_get(feed_url);
  if res.status <> 200 then
    raise exception 'schelagg programs: HTTP % from %', res.status, feed_url;
  end if;
  feed := res.content::jsonb;
  if coalesce((feed->>'feedVersion')::int, 0) <> 1 then
    raise exception 'schelagg programs: unsupported feedVersion %', feed->>'feedVersion';
  end if;
  if (feed->>'generatedAt')::timestamptz < run_at - interval '18 hours' then
    raise notice 'schelagg programs feed is stale (generated %); not ingesting', feed->>'generatedAt';
    return 0;
  end if;

  insert into public.external_programs as ep (
    id, source_id, kind, surface, region, state, series, org, title, venue, city, address, lat, lng,
    format, divisions, starts_on, ends_on, weekdays, registration_opens, registration_deadline, waitlist_on,
    team_price, individual_price, price_note, price_changes_on, status, signup_url, source_url, checked_at, updated_at
  )
  select
    p->>'id',
    p->>'source_id',
    p->>'kind',
    case when p->>'surface' in ('indoor', 'sand', 'grass') then p->>'surface' end,
    nullif(p->>'region', ''),
    nullif(p->>'state', ''),
    nullif(p->>'series', ''),
    p->>'org',
    p->>'title',
    nullif(p->>'venue', ''),
    nullif(p->>'city', ''),
    nullif(p->>'address', ''),
    (p->>'lat')::double precision,
    (p->>'lng')::double precision,
    nullif(p->>'format', ''),
    case when jsonb_typeof(p->'divisions') = 'array' then p->'divisions' else '[]'::jsonb end,
    (p->>'starts_on')::date,
    (p->>'ends_on')::date,
    case when jsonb_typeof(p->'weekdays') = 'array'
      then array(select jsonb_array_elements_text(p->'weekdays')) else '{}'::text[] end,
    (p->>'registration_opens')::date,
    (p->>'registration_deadline')::date,
    (p->>'waitlist_on')::date,
    nullif(p->>'team_price', ''),
    nullif(p->>'individual_price', ''),
    nullif(p->>'price_note', ''),
    (p->>'price_changes_on')::date,
    case when p->>'status' in ('open', 'waitlist', 'full', 'closed') then p->>'status' end,
    case when p->>'signup_url' like 'https://%' then p->>'signup_url' end,
    case when p->>'source_url' like 'https://%' then p->>'source_url' end,
    (p->>'checked_at')::timestamptz,
    run_at
  from jsonb_array_elements(coalesce(feed->'programs', '[]'::jsonb)) as p
  where p->>'sport' = 'volleyball'
    and p->>'kind' in ('league', 'tournament')
    and coalesce(p->>'id', '') <> ''
    and coalesce(p->>'title', '') <> ''
    and coalesce(p->>'org', '') <> ''
  on conflict (id) do update set
    source_id = excluded.source_id, kind = excluded.kind, surface = excluded.surface,
    region = excluded.region, state = excluded.state, series = excluded.series, org = excluded.org,
    title = excluded.title, venue = excluded.venue, city = excluded.city, address = excluded.address,
    lat = excluded.lat, lng = excluded.lng, format = excluded.format, divisions = excluded.divisions,
    starts_on = excluded.starts_on, ends_on = excluded.ends_on, weekdays = excluded.weekdays,
    registration_opens = excluded.registration_opens, registration_deadline = excluded.registration_deadline,
    waitlist_on = excluded.waitlist_on, team_price = excluded.team_price, individual_price = excluded.individual_price,
    price_note = excluded.price_note, price_changes_on = excluded.price_changes_on, status = excluded.status,
    signup_url = excluded.signup_url, source_url = excluded.source_url, checked_at = excluded.checked_at,
    updated_at = excluded.updated_at;
  get diagnostics n = row_count;

  -- Rows no longer in the feed are gone (past deadline, or removed by the organizer).
  if n > 0 then
    delete from public.external_programs where updated_at < run_at;
  end if;
  return n;
end;
$$;

revoke all on function public.ingest_schelagg_programs() from public, anon, authenticated;

-- Every two hours at :40: Schelagg rebuilds the feed twice a day, at no fixed time.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ingest-schelagg-programs') then
    perform cron.unschedule('ingest-schelagg-programs');
  end if;
  perform cron.schedule('ingest-schelagg-programs', '40 */2 * * *', 'select public.ingest_schelagg_programs()');
end;
$$;
