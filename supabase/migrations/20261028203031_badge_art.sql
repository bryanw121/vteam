-- #10: generated badge art. One row per (badge, tier) with the public URL of
-- the PNG the admin-only generate-badge-art edge function stored in the
-- `badges` bucket. The app reads it (hooks/useBadgeArt) and falls back to the
-- built-in art when there is no row; nothing generates on the render path.
--
-- Expand only: a new table. Readable by everyone (badges show on public
-- profiles, guests included); written only by the edge function with the
-- service role, so clients get no write grant and no write policy.

create table if not exists public.badge_art (
  badge_type text not null check (badge_type ~ '^[a-z0-9_]{1,40}$'),
  tier smallint not null check (tier between 1 and 10),
  image_url text not null check (image_url ~ '^https://' and char_length(image_url) <= 500),
  prompt text not null check (char_length(prompt) <= 4000),
  model text not null check (char_length(model) <= 80),
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  primary key (badge_type, tier)
);

create index if not exists badge_art_generated_by_idx on public.badge_art (generated_by);

alter table public.badge_art enable row level security;

revoke all on public.badge_art from anon, authenticated;
grant select (badge_type, tier, image_url, generated_at) on public.badge_art to anon, authenticated;

drop policy if exists badge_art_select on public.badge_art;
create policy badge_art_select on public.badge_art
  for select to anon, authenticated
  using (true);
