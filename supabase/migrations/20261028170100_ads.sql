-- Ads (#5): house banners and sponsored events, no ad network.
--
--   ad_banners        admin-managed house banners shown in the Events feed at
--                     a fixed cadence (constants/ads.ts). Everyone (guests
--                     too) reads the active ones: is_active and inside
--                     [starts_at, ends_at). Admins read and write all rows.
--   sponsored_events  event_id -> sponsorship window. A sponsored event gets a
--                     "Sponsored" label in the feed and one promoted slot.
--                     A separate table rather than an events column, so hosts
--                     (who may update their own events) can never set it, and
--                     the feed RPC / event selects stay untouched.
--
-- Admin = profiles.is_admin of auth.uid(), checked server-side by
-- current_user_is_admin() (SECURITY DEFINER, so it works even when is_admin is
-- not readable through the API). Admins manage rows with SQL or the dashboard
-- for now (see CLAUDE.md "Ads").

create or replace function public.current_user_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- #102 moves admins from profiles.is_admin to public.app_admins (and forces
  -- the column to false). Check whichever exists, so this works in either
  -- merge order; plpgsql only plans the branch it runs.
  if to_regclass('public.app_admins') is not null then
    return exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
  end if;
  return coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
end;
$$;

revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated;

create table if not exists public.ad_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text check (body is null or char_length(body) <= 140),
  image_url text check (image_url is null or image_url ~ '^https://'),
  link_url text not null check (link_url ~ '^https://'),
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  display_order integer not null default 0,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ad_banners_window check (ends_at is null or ends_at > starts_at)
);

create index if not exists ad_banners_created_by_idx on public.ad_banners (created_by);

create table if not exists public.sponsored_events (
  event_id uuid primary key references public.events (id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sponsored_events_window check (ends_at is null or ends_at > starts_at)
);

create index if not exists sponsored_events_created_by_idx on public.sponsored_events (created_by);

alter table public.ad_banners enable row level security;
alter table public.sponsored_events enable row level security;

revoke all on public.ad_banners from anon, authenticated;
revoke all on public.sponsored_events from anon, authenticated;
grant select on public.ad_banners to anon, authenticated;
grant select on public.sponsored_events to anon, authenticated;
grant insert, update, delete on public.ad_banners to authenticated;
grant insert, update, delete on public.sponsored_events to authenticated;

drop policy if exists "Anyone reads active banners" on public.ad_banners;
create policy "Anyone reads active banners" on public.ad_banners
  for select to anon, authenticated
  using (is_active and starts_at <= now() and (ends_at is null or ends_at > now()));

drop policy if exists "Admins manage banners" on public.ad_banners;
create policy "Admins manage banners" on public.ad_banners
  for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));

drop policy if exists "Anyone reads active sponsorships" on public.sponsored_events;
create policy "Anyone reads active sponsorships" on public.sponsored_events
  for select to anon, authenticated
  using (starts_at <= now() and (ends_at is null or ends_at > now()));

drop policy if exists "Admins manage sponsorships" on public.sponsored_events;
create policy "Admins manage sponsorships" on public.sponsored_events
  for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));
