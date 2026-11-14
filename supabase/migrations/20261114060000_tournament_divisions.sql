-- Tournament formats, step 2 (design: "vteam tournament creation"): divisions, days and
-- the settings the new formats need. Expand only: two new tables, nullable or defaulted
-- columns. Tournaments created before this keep working unchanged (no divisions = the one
-- bracket they have today; no days = their single start_date).
--
-- A division is one bracket fed by pool finishes (Platinum takes 1st, Gold 2nd–3rd, ...).
-- Finishes below the last division are out after pool play.

-- ─── Settings on the tournament ──────────────────────────────────────────────
alter table public.tournaments
  add column if not exists pool_matches_per_team smallint check (pool_matches_per_team is null or pool_matches_per_team between 1 and 20),
  add column if not exists warmup_minutes smallint not null default 0 check (warmup_minutes between 0 and 60),
  add column if not exists house_rule text check (house_rule is null or char_length(house_rule) <= 280);

comment on column public.tournaments.pool_matches_per_team is 'Pool matches each team plays; null = everyone in the pool (full round robin).';
comment on column public.tournaments.warmup_minutes is 'Warm-up before each match, inside the round (Texas AO: 5 + 40).';
comment on column public.tournaments.house_rule is 'One line shown on the tournament and at registration (an eligibility rule). Not enforced.';

-- Pool play may use its own match format: a fixed number of sets, where a split is a tie.
alter table public.tournament_rules
  add column if not exists pool_sets_played smallint check (pool_sets_played is null or pool_sets_played between 1 and 5);

comment on column public.tournament_rules.pool_sets_played is 'Pool matches play exactly this many sets (2 = a 1–1 split is a tie); null = same best-of as the bracket.';

-- ─── Divisions ───────────────────────────────────────────────────────────────
create table if not exists public.tournament_divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  display_order smallint not null check (display_order >= 0),
  from_place smallint not null check (from_place >= 1),
  to_place smallint not null,
  bracket_type text not null default 'single' check (bracket_type in ('single', 'double')),
  third_place_match boolean not null default false,
  created_at timestamptz not null default now(),
  check (to_place >= from_place),
  unique (tournament_id, display_order)
);

comment on table public.tournament_divisions is 'One bracket per row, fed by pool finishes from_place..to_place (1-based). Written by the tournament''s creator.';

alter table public.tournament_matches
  add column if not exists division_id uuid references public.tournament_divisions (id) on delete set null;

create index if not exists tournament_matches_division_id_idx on public.tournament_matches (division_id);

-- ─── Days ────────────────────────────────────────────────────────────────────
create table if not exists public.tournament_days (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  display_order smallint not null check (display_order >= 0),
  starts_at timestamptz not null,
  stage text not null default 'all' check (stage in ('all', 'pool', 'bracket')),
  created_at timestamptz not null default now(),
  unique (tournament_id, display_order)
);

comment on table public.tournament_days is 'A multi-day tournament''s days (Saturday pools, Sunday brackets). None = the single tournaments.start_date.';

-- ─── Access: the same two rules as tournament_pools ──────────────────────────
alter table public.tournament_divisions enable row level security;
alter table public.tournament_days enable row level security;
revoke all on table public.tournament_divisions, public.tournament_days from anon;
grant select, insert, update, delete on table public.tournament_divisions, public.tournament_days to authenticated;

create policy "creator can manage divisions" on public.tournament_divisions for all to authenticated
  using (exists (select 1 from public.tournaments t where t.id = tournament_divisions.tournament_id and t.created_by = (select auth.uid())))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_divisions.tournament_id and t.created_by = (select auth.uid())));

create policy "club members can view divisions" on public.tournament_divisions for select to authenticated
  using (exists (
    select 1 from public.tournaments t join public.club_members cm on cm.club_id = t.club_id
    where t.id = tournament_divisions.tournament_id and cm.user_id = (select auth.uid()) and t.status <> 'draft'
  ));

create policy "creator can manage days" on public.tournament_days for all to authenticated
  using (exists (select 1 from public.tournaments t where t.id = tournament_days.tournament_id and t.created_by = (select auth.uid())))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_days.tournament_id and t.created_by = (select auth.uid())));

create policy "club members can view days" on public.tournament_days for select to authenticated
  using (exists (
    select 1 from public.tournaments t join public.club_members cm on cm.club_id = t.club_id
    where t.id = tournament_days.tournament_id and cm.user_id = (select auth.uid()) and t.status <> 'draft'
  ));
