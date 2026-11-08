-- Tournament trophies on profiles, and host rule settings (#7).
--
-- tournament_rules gains two host settings:
--   tiebreakers        order of standings tiebreakers after wins (any of
--                      head_to_head, set_ratio, point_diff, points_for)
--   third_place_match  single elimination: play off third place instead of
--                      both semifinal losers sharing it
-- Both have defaults, so existing rows and older app versions are unaffected.
--
-- tournament_trophies: one row per player per podium place, written only by
-- complete_tournament(). Public read (anon + authenticated) because profiles
-- are public: a trophy shows on the winner's profile for anyone. The row keeps
-- the tournament title, date and team name, since tournaments themselves are
-- readable by club members only. No client writes (no INSERT/UPDATE/DELETE
-- grant or policy).
--
-- complete_tournament(p_tournament_id, p_podium): the organizer finishes a
-- tournament in one transaction: status -> completed (points PR #100 awards on
-- that) and the podium's rosters get trophies. Calling it again (a corrected
-- final) replaces that tournament's trophies. p_podium is a JSON array of
-- { team_id, place } with exactly one 1st, at most one 2nd and at most two 3rd
-- (ties for third), all registered teams of this tournament, no team twice.
-- A player on two podium teams (should not happen) keeps the better place.
--
-- Expand-only: new columns with defaults, a new table, a new function.

alter table public.tournament_rules
  add column if not exists tiebreakers text[] not null
    default array['head_to_head', 'set_ratio', 'point_diff', 'points_for']::text[],
  add column if not exists third_place_match boolean not null default false;

alter table public.tournament_rules drop constraint if exists tournament_rules_tiebreakers_check;
alter table public.tournament_rules add constraint tournament_rules_tiebreakers_check
  check (
    cardinality(tiebreakers) between 1 and 4
    and tiebreakers <@ array['head_to_head', 'set_ratio', 'point_diff', 'points_for']::text[]
  );

create table if not exists public.tournament_trophies (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid references public.tournament_teams (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place smallint not null check (place between 1 and 3),
  tournament_title text not null,
  tournament_date timestamptz not null,
  team_name text not null,
  awarded_at timestamptz not null default now(),
  constraint tournament_trophies_once_per_player unique (tournament_id, user_id)
);

create index if not exists tournament_trophies_user_id_idx on public.tournament_trophies (user_id, tournament_date desc);
create index if not exists tournament_trophies_team_id_idx on public.tournament_trophies (team_id);

alter table public.tournament_trophies enable row level security;

-- Supabase grants everything on new public tables by default: read-only for clients.
revoke all on table public.tournament_trophies from anon, authenticated;
grant select on table public.tournament_trophies to anon, authenticated;

drop policy if exists "Trophies are public" on public.tournament_trophies;
create policy "Trophies are public"
  on public.tournament_trophies for select
  to anon, authenticated
  using (true);

create or replace function public.complete_tournament(p_tournament_id uuid, p_podium jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tournaments%rowtype;
  v_firsts integer;
  v_seconds integer;
  v_thirds integer;
  v_entries integer;
  v_valid integer;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Sign in to finish the tournament' using errcode = '28000';
  end if;
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found or v_t.created_by <> v_uid then
    raise exception 'Only the organizer can finish the tournament' using errcode = '42501';
  end if;
  if v_t.status = 'cancelled' then
    raise exception 'This tournament was cancelled' using errcode = 'P0001';
  end if;
  if p_podium is null or jsonb_typeof(p_podium) <> 'array' then
    raise exception 'p_podium must be a JSON array' using errcode = '22023';
  end if;

  select count(*),
         count(*) filter (where e->>'place' = '1'),
         count(*) filter (where e->>'place' = '2'),
         count(*) filter (where e->>'place' = '3')
    into v_entries, v_firsts, v_seconds, v_thirds
  from jsonb_array_elements(p_podium) e;
  if v_firsts <> 1 or v_seconds > 1 or v_thirds > 2 or v_entries <> v_firsts + v_seconds + v_thirds then
    raise exception 'A podium has one champion, at most one runner-up and at most two third places' using errcode = '22023';
  end if;

  -- Every entry is a distinct registered team of this tournament.
  select count(distinct tt.id) into v_valid
  from jsonb_array_elements(p_podium) e
  join public.tournament_teams tt
    on tt.id::text = e->>'team_id' and tt.tournament_id = p_tournament_id and tt.status = 'registered';
  if v_valid <> v_entries then
    raise exception 'Podium teams must be different registered teams of this tournament' using errcode = '22023';
  end if;

  update public.tournaments set status = 'completed' where id = p_tournament_id;

  delete from public.tournament_trophies where tournament_id = p_tournament_id;
  insert into public.tournament_trophies (tournament_id, team_id, user_id, place, tournament_title, tournament_date, team_name)
  select distinct on (m.user_id)
         p_tournament_id, tt.id, m.user_id, (e->>'place')::smallint, v_t.title, v_t.start_date, tt.name
  from jsonb_array_elements(p_podium) e
  join public.tournament_teams tt on tt.id::text = e->>'team_id'
  join public.tournament_team_members m on m.team_id = tt.id
  order by m.user_id, (e->>'place')::smallint;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.complete_tournament(uuid, jsonb) from public, anon;
grant execute on function public.complete_tournament(uuid, jsonb) to authenticated;
