-- Search (#176): find a game, place, host or club from the Events tab.
--
-- search_feed(q, scope, region) is SECURITY INVOKER: it runs as the caller, so
-- every table's RLS decides what comes back (guests get what the guest feed
-- shows). It returns ids and small public fields only:
--   events   ids of matching vteam games, best first (the app loads the cards)
--   external matching sessions from other venues in the region (fresh, upcoming)
--   hosts    people with upcoming games whose name matches (brief columns)
--   clubs    matching clubs
-- scope 'mine_past' searches the caller's own attended games of the last year
-- (events only; empty for guests).
--
-- Typo tolerance: pg_trgm word_similarity ("zilkr" finds "Zilker"), plus a plain
-- substring match. Expand only: an extension, indexes and one function.

create extension if not exists pg_trgm with schema extensions;

create index if not exists events_title_trgm_idx on public.events using gin (lower(title) extensions.gin_trgm_ops);
create index if not exists events_location_trgm_idx on public.events using gin (lower(location) extensions.gin_trgm_ops);
create index if not exists external_sessions_title_trgm_idx on public.external_sessions using gin (lower(title) extensions.gin_trgm_ops);
create index if not exists external_sessions_venue_trgm_idx on public.external_sessions using gin (lower(venue) extensions.gin_trgm_ops);
create index if not exists clubs_name_trgm_idx on public.clubs using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists profiles_username_trgm_idx on public.profiles using gin (lower(username) extensions.gin_trgm_ops);

-- How well q matches a piece of text: 1 for a substring, else trigram word similarity.
create or replace function public.search_score(p_q text, p_text text)
returns real
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_text is null or p_text = '' then 0::real
    when strpos(lower(p_text), p_q) > 0 then 1::real
    else extensions.word_similarity(p_q, lower(p_text))
  end
$$;

create or replace function public.search_feed(q text, scope text default 'upcoming', region text default 'austin')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  needle text := lower(btrim(coalesce(q, '')));
  me uuid := auth.uid();
  min_score constant real := 0.45;
  now_utc timestamp := now() at time zone 'UTC';
  events_out jsonb;
  external_out jsonb := '[]'::jsonb;
  hosts_out jsonb := '[]'::jsonb;
  clubs_out jsonb := '[]'::jsonb;
begin
  if char_length(needle) < 2 or char_length(needle) > 60 then
    raise exception 'search text must be 2 to 60 characters' using errcode = '22023';
  end if;
  if scope not in ('upcoming', 'mine_past') then
    raise exception 'unknown search scope' using errcode = '22023';
  end if;

  if scope = 'mine_past' then
    if me is null then
      return jsonb_build_object('events', '[]'::jsonb, 'external', '[]'::jsonb, 'hosts', '[]'::jsonb, 'clubs', '[]'::jsonb);
    end if;
    select coalesce(jsonb_agg(m.id order by m.score desc, m.event_date desc), '[]'::jsonb) into events_out
    from (select * from (
      select e.id, e.event_date,
             greatest(public.search_score(needle, e.title), public.search_score(needle, e.location),
                      public.search_score(needle, concat_ws(' ', p.first_name, p.last_name)), public.search_score(needle, p.username)) as score
      from public.events e
      join public.event_attendees a on a.event_id = e.id and a.user_id = me and a.status = 'attending'
      left join public.profiles p on p.id = e.created_by
      where e.event_date < now_utc
        and e.event_date > now_utc - interval '365 days'
    ) s where s.score >= min_score order by s.score desc, s.event_date desc limit 20) m;
    return jsonb_build_object('events', events_out, 'external', '[]'::jsonb, 'hosts', '[]'::jsonb, 'clubs', '[]'::jsonb);
  end if;

  -- Upcoming vteam games: title, place or host name.
  select coalesce(jsonb_agg(m.id order by m.score desc, m.event_date), '[]'::jsonb) into events_out
  from (select * from (
    select e.id, e.event_date,
           greatest(public.search_score(needle, e.title), public.search_score(needle, e.location),
                    public.search_score(needle, concat_ws(' ', p.first_name, p.last_name)), public.search_score(needle, p.username)) as score
    from public.events e
    left join public.profiles p on p.id = e.created_by
    where e.cancelled_at is null
      and e.event_date > now_utc - interval '3 hours'
      and e.event_date < now_utc + interval '60 days'
  ) s where s.score >= min_score order by s.score desc, s.event_date limit 20) m;

  -- Sessions from other venues in the viewer's region, refreshed by the import in the last 12 hours.
  select coalesce(jsonb_agg(to_jsonb(m) - 'score' order by m.score desc, m.starts_at), '[]'::jsonb) into external_out
  from (select * from (
    select x.id, x.source_id, x.title, x.venue, x.city, x.surface, x.session_type, x.level, x.price,
           x.starts_at, x.ends_at, x.signup_url, x.signup_label, x.note, x.canceled, x.verified_at, x.updated_at, x.region,
           greatest(public.search_score(needle, x.title), public.search_score(needle, x.venue), public.search_score(needle, x.note)) as score
    from public.external_sessions x
    where x.region = coalesce(nullif(search_feed.region, ''), 'austin')
      and not x.canceled
      and x.starts_at > now()
      and x.starts_at < now() + interval '60 days'
      and x.updated_at > now() - interval '12 hours'
  ) s where s.score >= min_score order by s.score desc, s.starts_at limit 20) m;

  -- Hosts and co-hosts of upcoming games (never a general directory of players).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'username', m.username, 'first_name', m.first_name, 'last_name', m.last_name,
           'avatar_url', m.avatar_url, 'upcoming', m.upcoming
         ) order by m.score desc, m.upcoming desc), '[]'::jsonb) into hosts_out
  from (select * from (
    select p.id, p.username, p.first_name, p.last_name, p.avatar_url, h.upcoming,
           greatest(public.search_score(needle, concat_ws(' ', p.first_name, p.last_name)), public.search_score(needle, p.username)) as score
    from (
      select host_id, count(distinct event_id)::integer as upcoming
      from (
        select e.created_by as host_id, e.id as event_id
        from public.events e
        where e.cancelled_at is null and e.event_date > now_utc and e.event_date < now_utc + interval '60 days' and e.created_by is not null
        union all
        select c.user_id, e.id
        from public.event_cohosts c
        join public.events e on e.id = c.event_id
        where e.cancelled_at is null and e.event_date > now_utc and e.event_date < now_utc + interval '60 days'
      ) hosted
      group by host_id
    ) h
    join public.profiles p on p.id = h.host_id
  ) s where s.score >= min_score order by s.score desc, s.upcoming desc limit 20) m;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'name', m.name, 'avatar_url', m.avatar_url, 'location_name', m.location_name,
           'membership_type', m.membership_type, 'members', m.members
         ) order by m.score desc, m.members desc), '[]'::jsonb) into clubs_out
  from (select * from (
    select c.id, c.name, c.avatar_url, c.location_name, c.membership_type,
           (select count(*)::integer from public.club_members cm where cm.club_id = c.id) as members,
           greatest(public.search_score(needle, c.name), public.search_score(needle, c.location_name)) as score
    from public.clubs c
  ) s where s.score >= min_score order by s.score desc, s.members desc limit 20) m;

  return jsonb_build_object('events', events_out, 'external', external_out, 'hosts', hosts_out, 'clubs', clubs_out);
end;
$$;

comment on function public.search_feed(text, text, text) is
  'Search (#176), SECURITY INVOKER: {events: [id], external: [session], hosts: [brief profile + upcoming], clubs: [club]} for q (2–60 chars). scope upcoming | mine_past.';

revoke execute on function public.search_feed(text, text, text) from public;
grant execute on function public.search_feed(text, text, text) to anon, authenticated;
grant execute on function public.search_score(text, text) to anon, authenticated;
