-- Club polls (#175): "Which night next week?" in one tap; the winning time becomes the event.
--
-- A poll is a club post (club_posts.body = the question) with a club_polls row,
-- 2–10 options and members' votes. Members read everything (same predicate as
-- club_posts_select_members); nobody writes the tables directly:
--   create_club_poll(...)  club owners only; one transaction; notifies members
--   vote_club_poll(...)    members only, while open; replaces the caller's votes
--   link_poll_event(...)   the owner who created the event links it to the poll
-- Closing is a timestamp (closes_at): no cron.
--
-- Expand only: three new tables, three functions and a widened check constraint.

-- ─── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.club_polls (
  post_id uuid primary key references public.club_posts (id) on delete cascade,
  kind text not null check (kind in ('text', 'time')),
  multi boolean not null default true,
  closes_at timestamptz,
  event_id uuid references public.events (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.club_polls (post_id) on delete cascade,
  position smallint not null,
  label text not null check (char_length(label) between 1 and 80),
  starts_at timestamptz,
  unique (post_id, position)
);

create table if not exists public.club_poll_votes (
  option_id uuid not null references public.club_poll_options (id) on delete cascade,
  post_id uuid not null references public.club_polls (post_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);

create index if not exists club_poll_votes_post_id_idx on public.club_poll_votes (post_id);
create index if not exists club_poll_votes_user_id_idx on public.club_poll_votes (user_id);
create index if not exists club_polls_event_id_idx on public.club_polls (event_id);

comment on table public.club_polls is 'Club polls (#175): one per poll post. Members read; written only by create_club_poll / link_poll_event.';
comment on table public.club_poll_options is 'Club poll options (2–10 per poll). Members read; written only by create_club_poll.';
comment on table public.club_poll_votes is 'Club poll votes (who picked what is visible to members). Written only by vote_club_poll.';

alter table public.club_polls enable row level security;
alter table public.club_poll_options enable row level security;
alter table public.club_poll_votes enable row level security;
revoke all on table public.club_polls, public.club_poll_options, public.club_poll_votes from anon;
revoke insert, update, delete on table public.club_polls, public.club_poll_options, public.club_poll_votes from authenticated;
grant select on table public.club_polls, public.club_poll_options, public.club_poll_votes to authenticated;

create policy club_polls_select_members on public.club_polls for select to authenticated
  using (exists (
    select 1 from public.club_posts p join public.club_members m on m.club_id = p.club_id
    where p.id = club_polls.post_id and m.user_id = (select auth.uid())
  ));
create policy club_poll_options_select_members on public.club_poll_options for select to authenticated
  using (exists (
    select 1 from public.club_posts p join public.club_members m on m.club_id = p.club_id
    where p.id = club_poll_options.post_id and m.user_id = (select auth.uid())
  ));
create policy club_poll_votes_select_members on public.club_poll_votes for select to authenticated
  using (exists (
    select 1 from public.club_posts p join public.club_members m on m.club_id = p.club_id
    where p.id = club_poll_votes.post_id and m.user_id = (select auth.uid())
  ));

-- ─── Notification type ───────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted', 'event_cancelled',
    'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned', 'join_request', 'request_approved',
    'request_denied', 'tournament_team_invite', 'tournament_join_request', 'tournament_join_accepted',
    'tournament_join_declined', 'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention',
    'event_reminder', 'late_dropout', 'friend_request', 'friend_accepted', 'bring_item_uncovered',
    'report_resolved', 'moderation_warning', 'new_game', 'club_poll'
  ]::text[])
);

-- ─── create_club_poll ────────────────────────────────────────────────────────
-- p_options: [{"label": "Thu 7 PM", "starts_at": "2026-11-19T01:00:00Z"}, …] (starts_at for time polls).
create or replace function public.create_club_poll(
  p_club_id uuid,
  p_question text,
  p_kind text,
  p_options jsonb,
  p_multi boolean default true,
  p_closes_at timestamptz default null,
  p_notify boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  q text := btrim(coalesce(p_question, ''));
  n integer;
  post uuid;
  club_name text;
  opt jsonb;
  i integer := 0;
  lbl text;
  starts timestamptz;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.club_members m where m.club_id = p_club_id and m.user_id = me and m.role = 'owner') then
    raise exception 'only club owners can post polls' using errcode = '42501';
  end if;
  if char_length(q) < 1 or char_length(q) > 140 then
    raise exception 'the question must be 1 to 140 characters' using errcode = '22023';
  end if;
  if p_kind not in ('text', 'time') then
    raise exception 'unknown poll kind' using errcode = '22023';
  end if;
  if jsonb_typeof(p_options) <> 'array' then
    raise exception 'options must be a list' using errcode = '22023';
  end if;
  n := jsonb_array_length(p_options);
  if n < 2 or n > 10 then
    raise exception 'a poll needs 2 to 10 options' using errcode = '22023';
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'the close time must be in the future' using errcode = '22023';
  end if;

  insert into public.club_posts (club_id, created_by, body) values (p_club_id, me, q) returning id into post;
  insert into public.club_polls (post_id, kind, multi, closes_at) values (post, p_kind, coalesce(p_multi, true), p_closes_at);

  for opt in select value from jsonb_array_elements(p_options) loop
    lbl := btrim(coalesce(opt ->> 'label', ''));
    starts := nullif(opt ->> 'starts_at', '')::timestamptz;
    if p_kind = 'time' then
      if starts is null or starts <= now() then
        raise exception 'time options need a future date and time' using errcode = '22023';
      end if;
    else
      starts := null;
    end if;
    if char_length(lbl) < 1 or char_length(lbl) > 80 then
      raise exception 'options must be 1 to 80 characters' using errcode = '22023';
    end if;
    insert into public.club_poll_options (post_id, position, label, starts_at) values (post, i, lbl, starts);
    i := i + 1;
  end loop;

  if coalesce(p_notify, true) then
    select c.name into club_name from public.clubs c where c.id = p_club_id;
    insert into public.notifications (user_id, notification_type, title, body, data)
    select m.user_id, 'club_poll', coalesce(club_name, 'Your club') || ': new poll', q,
           jsonb_build_object('club_id', p_club_id, 'post_id', post, 'deep_link', '/club/' || p_club_id::text)
    from public.club_members m
    where m.club_id = p_club_id
      and m.user_id <> me
      and public.notification_pref_enabled(m.user_id, 'in_app', 'club_poll');
  end if;

  return post;
end;
$$;

comment on function public.create_club_poll(uuid, text, text, jsonb, boolean, timestamptz, boolean) is
  'Club polls (#175): owner posts a poll (2–10 options; time options need a future starts_at). Notifies members with club_poll. Returns the post id.';

-- ─── vote_club_poll ──────────────────────────────────────────────────────────
-- Replaces the caller's votes on the poll with p_option_ids (empty clears them).
create or replace function public.vote_club_poll(p_post_id uuid, p_option_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  poll public.club_polls%rowtype;
  wanted uuid[] := coalesce((select array_agg(distinct x) from unnest(coalesce(p_option_ids, '{}')) x), '{}');
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into poll from public.club_polls where post_id = p_post_id;
  if not found then
    raise exception 'no such poll' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.club_posts p join public.club_members m on m.club_id = p.club_id
    where p.id = p_post_id and m.user_id = me
  ) then
    raise exception 'only club members can vote' using errcode = '42501';
  end if;
  if poll.closes_at is not null and poll.closes_at <= now() then
    raise exception 'this poll is closed' using errcode = '22023';
  end if;
  if not poll.multi and cardinality(wanted) > 1 then
    raise exception 'pick one option' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(wanted) w where not exists (
    select 1 from public.club_poll_options o where o.id = w and o.post_id = p_post_id
  )) then
    raise exception 'that option is not in this poll' using errcode = '22023';
  end if;

  delete from public.club_poll_votes where post_id = p_post_id and user_id = me;
  insert into public.club_poll_votes (option_id, post_id, user_id)
  select w, p_post_id, me from unnest(wanted) w;
end;
$$;

-- ─── link_poll_event ─────────────────────────────────────────────────────────
create or replace function public.link_poll_event(p_post_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  club uuid;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select p.club_id into club from public.club_posts p join public.club_polls cp on cp.post_id = p.id where p.id = p_post_id;
  if club is null then
    raise exception 'no such poll' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.club_members m where m.club_id = club and m.user_id = me and m.role = 'owner') then
    raise exception 'only club owners can link a poll' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.created_by = me and e.club_id = club) then
    raise exception 'link an event you host for this club' using errcode = '42501';
  end if;
  update public.club_polls set event_id = p_event_id where post_id = p_post_id;
end;
$$;

revoke execute on function public.create_club_poll(uuid, text, text, jsonb, boolean, timestamptz, boolean) from public, anon;
revoke execute on function public.vote_club_poll(uuid, uuid[]) from public, anon;
revoke execute on function public.link_poll_event(uuid, uuid) from public, anon;
grant execute on function public.create_club_poll(uuid, text, text, jsonb, boolean, timestamptz, boolean) to authenticated;
grant execute on function public.vote_club_poll(uuid, uuid[]) to authenticated;
grant execute on function public.link_poll_event(uuid, uuid) to authenticated;
