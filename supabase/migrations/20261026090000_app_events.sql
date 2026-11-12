-- Lightweight usage metrics: app_events.
--
-- The client (lib/analytics.ts) batches small events (banner shown / tapped /
-- dismissed, tour started / step viewed / completed / skipped) and inserts
-- them in one request every ~10s or when the app goes to the background.
--
--   name       event name (constants/analytics.ts), short snake_case
--   props      small JSON object (ids, step index, source); capped at 1 KB
--   user_id    auth.uid() of the signed-in user, null for guests (set by the
--              default; clients can't write it, see the column grant below)
--   anon_id    random per-device id stored locally (counts guests and devices)
--   platform   ios / android / web
--
-- Write-only for clients: anon and authenticated may INSERT (name, props,
-- anon_id, platform) only, and there is no SELECT policy, so nobody reads rows
-- through the API. The owner reads counts with SQL (see CLAUDE.md, "Usage
-- metrics"). Rows older than 180 days are pruned daily by pg_cron.
--
-- No UPDATE/DELETE/DROP statements at top level (they need interactive
-- confirmation through the Supabase connector). Idempotent.

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  name text not null check (name ~ '^[a-z][a-z0-9_]{0,63}$'),
  props jsonb not null default '{}'::jsonb
    check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 1024),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  anon_id text check (anon_id is null or char_length(anon_id) <= 64),
  platform text check (platform is null or char_length(platform) <= 16),
  created_at timestamptz not null default now()
);

create index if not exists app_events_name_created_at_idx on public.app_events (name, created_at);

alter table public.app_events enable row level security;

-- Insert only the descriptive columns: user_id comes from the auth.uid()
-- default and created_at from now(), so neither can be spoofed.
revoke all on public.app_events from anon, authenticated;
grant insert (name, props, anon_id, platform) on public.app_events to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_events' and policyname = 'Anyone can record app events') then
    create policy "Anyone can record app events" on public.app_events
      for insert to anon, authenticated
      with check (user_id is null or user_id = (select auth.uid()));
  end if;
end $$;

-- Daily prune at 03:17 UTC.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-app-events') then
    perform cron.unschedule('prune-app-events');
  end if;
  perform cron.schedule(
    'prune-app-events',
    '17 3 * * *',
    $job$delete from public.app_events where created_at < now() - interval '180 days'$job$
  );
end $$;
