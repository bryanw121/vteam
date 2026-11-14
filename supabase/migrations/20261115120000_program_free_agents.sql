-- Find a team (#304): players looking for a team or partner for an outside tournament or
-- league (Schelagg's `external_programs`). Signed-in players read the list and message each
-- other; guests get only counts. Expand only.

create table public.program_free_agents (
  id            uuid primary key default gen_random_uuid(),
  -- A Schelagg program id. No foreign key: the programs mirror is rebuilt by the ingest, and a
  -- feed glitch must not delete what players wrote. Title and end date are copied at insert.
  program_id    text not null,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  want          text not null default 'team' check (want in ('partner', 'team', 'players')),
  positions     text[] not null default '{}' check (
                  cardinality(positions) <= 6
                  and positions <@ array['setter', 'libero', 'outside_hitter', 'defensive_specialist', 'opposite_hitter', 'middle_blocker']::text[]
                ),
  note          text check (note is null or char_length(note) <= 200),
  program_title text not null default '',
  expires_on    date not null default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (program_id, user_id)
);

create index program_free_agents_program_idx on public.program_free_agents (program_id, expires_on);
create index program_free_agents_user_idx on public.program_free_agents (user_id);

comment on table public.program_free_agents is
  'Find a team (#304): who is looking for a team or partner for an outside program. Signed-in read (unexpired, not silenced either way); own rows written; guests read counts only via program_free_agent_counts().';

-- True unless the caller and p_user have silenced each other (either way). Definer: chat_silences
-- is owner-only, so a policy can't see whether the other person silenced the caller.
create or replace function public.free_agent_visible(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.chat_silences s
    where (s.user_id = (select auth.uid()) and s.silenced_user_id = p_user)
       or (s.user_id = p_user and s.silenced_user_id = (select auth.uid()))
  )
$$;
revoke execute on function public.free_agent_visible(uuid) from public, anon;
grant execute on function public.free_agent_visible(uuid) to authenticated;

-- Own rows only; copy the program's title and last day; refuse unknown or finished programs (P0002).
create or replace function public.program_free_agents_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_last  date;
begin
  -- Own rows only (RLS says the same; checked first so the error is the RLS one, 42501).
  if (select auth.uid()) is not null and new.user_id is distinct from (select auth.uid()) then
    raise exception 'new row violates row-level security policy for table "program_free_agents"' using errcode = '42501';
  end if;
  select p.title, coalesce(p.ends_on, p.starts_on)
    into v_title, v_last
    from public.external_programs p
   where p.id = new.program_id;
  if not found then
    raise exception 'Unknown program' using errcode = 'P0002';
  end if;
  if v_last is not null and v_last < current_date then
    raise exception 'That program has ended' using errcode = 'P0002';
  end if;
  new.program_title := coalesce(v_title, '');
  new.expires_on := coalesce(v_last, current_date + 30);
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.program_free_agents_fill() from public, anon, authenticated;

create trigger program_free_agents_fill
  before insert or update of program_id, want, positions, note on public.program_free_agents
  for each row execute function public.program_free_agents_fill();

create trigger trg_rate_limit_program_free_agents
  before insert on public.program_free_agents
  for each row execute function public.rate_limit_insert('free_agents', '20', '3600');

alter table public.program_free_agents enable row level security;
revoke all on public.program_free_agents from anon, authenticated;
grant select, insert, delete on public.program_free_agents to authenticated;
grant update (want, positions, note) on public.program_free_agents to authenticated;

create policy program_free_agents_select on public.program_free_agents
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (expires_on >= current_date and public.free_agent_visible(user_id))
  );

create policy program_free_agents_insert on public.program_free_agents
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy program_free_agents_update on public.program_free_agents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy program_free_agents_delete on public.program_free_agents
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- How many are looking, per program: numbers only, for guests too.
create or replace function public.program_free_agent_counts(p_ids text[])
returns table (program_id text, n integer)
language sql
stable
security definer
set search_path = ''
as $$
  select f.program_id, count(*)::integer
    from public.program_free_agents f
   where f.program_id = any (p_ids[1:100])
     and f.expires_on >= current_date
   group by f.program_id
$$;
revoke execute on function public.program_free_agent_counts(text[]) from public;
grant execute on function public.program_free_agent_counts(text[]) to anon, authenticated;
