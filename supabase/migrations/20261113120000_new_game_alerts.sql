-- New game alerts (#170): hear when your clubs, or hosts you play with, post a game.
--
-- 1. notifications: a new type, new_game.
-- 2. user_settings.game_alerts: the player's sources (clubs on, hosts off by
--    default) and "only when it's" filters (surfaces, levels, times; empty = any).
-- 3. club_members.game_alerts: per-club mute, written only through
--    set_club_game_alerts() (members can't update their own membership row).
-- 4. game_alert_log: one row per (player, event) alerted. Service-only.
-- 5. game_alert_matches() / new_game_alert_text(): pure helpers (filters, copy).
-- 6. send_new_game_alerts(): pg_cron every 10 minutes. Events 10–70 minutes old
--    (the host can still fix or delete a draft), not cancelled, not started, not
--    full. Recipients: club members with alerts on, and players who attended 2+
--    of the host's games in the last 180 days. Never the host, anyone already on
--    the roster, anyone who silenced the host. At most 3 alerts a Chicago day;
--    several games from one club or host in one run arrive as one alert.
--
-- Expand only: a widened check constraint, columns with defaults, a new table,
-- functions and a cron job.

-- ─── 1. Notification type ────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted', 'event_cancelled',
    'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned', 'join_request', 'request_approved',
    'request_denied', 'tournament_team_invite', 'tournament_join_request', 'tournament_join_accepted',
    'tournament_join_declined', 'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention',
    'event_reminder', 'late_dropout', 'friend_request', 'friend_accepted', 'bring_item_uncovered',
    'report_resolved', 'moderation_warning', 'new_game'
  ]::text[])
);

-- ─── 2. Player settings ──────────────────────────────────────────────────────
alter table public.user_settings
  add column if not exists game_alerts jsonb not null
  default '{"clubs": true, "hosts": false, "surfaces": [], "levels": [], "times": []}'::jsonb
  constraint user_settings_game_alerts_check check (jsonb_typeof(game_alerts) = 'object');

comment on column public.user_settings.game_alerts is
  'New game alerts (#170): {clubs, hosts: boolean; surfaces, levels, times: text[]} (empty array = any).';

-- ─── 3. Per-club mute ────────────────────────────────────────────────────────
alter table public.club_members add column if not exists game_alerts boolean not null default true;

comment on column public.club_members.game_alerts is
  'Whether this member hears about the club''s new games (#170). Written by set_club_game_alerts().';

create or replace function public.set_club_game_alerts(p_club_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  update public.club_members set game_alerts = coalesce(p_on, true)
  where club_id = p_club_id and user_id = auth.uid();
  if not found then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.set_club_game_alerts(uuid, boolean) from public, anon;
grant execute on function public.set_club_game_alerts(uuid, boolean) to authenticated;

-- ─── 4. Dedupe ledger ────────────────────────────────────────────────────────
create table if not exists public.game_alert_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists game_alert_log_event_id_idx on public.game_alert_log (event_id);

comment on table public.game_alert_log is
  'One row per (player, event) already alerted by send_new_game_alerts(). Service-only: RLS on, no policies.';

alter table public.game_alert_log enable row level security;
revoke all on table public.game_alert_log from anon, authenticated;

-- The alert scan looks at events created in the last 70 minutes.
create index if not exists events_created_at_idx on public.events (created_at) where cancelled_at is null;

-- ─── 5. Pure helpers ─────────────────────────────────────────────────────────
-- Whether a game fits a player's "only when it's" filters. An empty or missing
-- list means any. A game without a surface only matches when surfaces is empty;
-- a game open to every level (no skill_levels) matches any level filter.
create or replace function public.game_alert_matches(
  p_prefs jsonb,
  p_surface text,
  p_levels text[],
  p_starts_at timestamptz
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  surfaces jsonb := case when jsonb_typeof(p_prefs -> 'surfaces') = 'array' then p_prefs -> 'surfaces' else '[]'::jsonb end;
  levels jsonb := case when jsonb_typeof(p_prefs -> 'levels') = 'array' then p_prefs -> 'levels' else '[]'::jsonb end;
  times jsonb := case when jsonb_typeof(p_prefs -> 'times') = 'array' then p_prefs -> 'times' else '[]'::jsonb end;
  local_start timestamp := p_starts_at at time zone 'America/Chicago';
  bucket text;
begin
  if jsonb_array_length(surfaces) > 0 and (p_surface is null or not surfaces ? p_surface) then
    return false;
  end if;
  if jsonb_array_length(levels) > 0 and coalesce(cardinality(p_levels), 0) > 0
     and not exists (select 1 from unnest(p_levels) l where levels ? l) then
    return false;
  end if;
  if jsonb_array_length(times) > 0 then
    bucket := case
      when extract(isodow from local_start) in (6, 7) then 'weekend'
      when extract(hour from local_start) >= 17 then 'weekday_evening'
      else 'weekday_day'
    end;
    if not times ? bucket then
      return false;
    end if;
  end if;
  return true;
end;
$$;

comment on function public.game_alert_matches(jsonb, text, text[], timestamptz) is
  'New game alert filters (#170): surfaces / levels / times (weekday_evening from 5 PM, weekday_day, weekend; America/Chicago). Empty = any.';

-- Copy for one alert. p_count > 1 is a grouped alert (first game's details).
create or replace function public.new_game_alert_text(
  p_source text,
  p_source_name text,
  p_count integer,
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_going integer,
  p_max integer
)
returns table (title text, body text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  local_start timestamp := p_starts_at at time zone 'America/Chicago';
  clock text := to_char(local_start, 'Dy FMHH12:MI AM');
  game text := coalesce(nullif(btrim(p_title), ''), 'A game');
  who text := coalesce(nullif(btrim(p_source_name), ''), case when p_source = 'club' then 'your club' else 'A host' end);
begin
  if p_count > 1 then
    title := case when p_source = 'club' then who || ': ' || p_count || ' new games' else who || ' posted ' || p_count || ' games' end;
    body := 'First ' || clock || ' · ' || game;
  else
    title := case when p_source = 'club' then 'New game from ' || who else who || ' posted a game' end;
    body := game || ' · ' || clock
      || coalesce(' · ' || nullif(btrim(p_location), ''), '')
      || ' · ' || greatest(p_going, 0) || case when p_max is not null then ' of ' || p_max else '' end || ' going';
  end if;
  return next;
end;
$$;

comment on function public.new_game_alert_text(text, text, integer, text, text, timestamptz, integer, integer) is
  'New game alert copy (#170): "New game from <club>" / "<Host F.> posted a game", body "<title> · Thu 7:00 PM · <location> · 3 of 12 going".';

-- ─── 6. The job ──────────────────────────────────────────────────────────────
-- events.event_date and events.created_at are timestamps without time zone holding UTC.
create or replace function public.send_new_game_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent integer;
  today_start timestamptz := date_trunc('day', now() at time zone 'America/Chicago') at time zone 'America/Chicago';
begin
  with cand as (
    select e.id, e.title, e.location, e.created_by, e.club_id, e.surface, e.skill_levels, e.max_attendees,
           (e.event_date at time zone 'UTC') as starts_at,
           (select count(*)::integer from public.event_attendees a where a.event_id = e.id and a.status = 'attending') as going
    from public.events e
    where e.cancelled_at is null
      and e.created_by is not null
      and e.created_at >= (now() at time zone 'UTC') - interval '70 minutes'
      and e.created_at <= (now() at time zone 'UTC') - interval '10 minutes'
      and e.event_date > (now() at time zone 'UTC')
  ),
  open_cand as (
    select * from cand where max_attendees is null or going < max_attendees
  ),
  sources as (
    select c.id as event_id, m.user_id, 'club'::text as source, c.club_id as group_id
    from open_cand c
    join public.club_members m on m.club_id = c.club_id and m.game_alerts
    union all
    select c.id, r.user_id, 'host'::text, c.created_by
    from open_cand c
    cross join lateral (
      select a.user_id
      from public.event_attendees a
      join public.events pe on pe.id = a.event_id
      where pe.created_by = c.created_by
        and pe.cancelled_at is null
        and pe.event_date < (now() at time zone 'UTC')
        and pe.event_date > (now() at time zone 'UTC') - interval '180 days'
        and a.status = 'attending'
        and not coalesce(a.no_show, false)
      group by a.user_id
      having count(distinct pe.id) >= 2
    ) r
  ),
  eligible as (
    select distinct on (s.event_id, s.user_id) s.event_id, s.user_id, s.source, s.group_id
    from sources s
    join open_cand c on c.id = s.event_id
    left join public.user_settings us on us.user_id = s.user_id
    cross join lateral (
      select coalesce(us.game_alerts, '{"clubs": true, "hosts": false}'::jsonb) as prefs
    ) p
    where s.user_id <> c.created_by
      and case s.source
            when 'club' then coalesce((p.prefs ->> 'clubs')::boolean, true)
            else coalesce((p.prefs ->> 'hosts')::boolean, false)
          end
      and public.game_alert_matches(p.prefs, c.surface, c.skill_levels, c.starts_at)
      and not exists (select 1 from public.event_attendees a where a.event_id = s.event_id and a.user_id = s.user_id)
      and not exists (select 1 from public.chat_silences cs where cs.user_id = s.user_id and cs.silenced_user_id = c.created_by)
      and not exists (select 1 from public.game_alert_log g where g.user_id = s.user_id and g.event_id = s.event_id)
      and public.notification_pref_enabled(s.user_id, 'in_app', 'new_game')
    -- A club member hears it as the club's game, not the host's.
    order by s.event_id, s.user_id, (s.source = 'club') desc
  ),
  groups as (
    select e.user_id, e.source, e.group_id,
           count(*)::integer as n,
           (array_agg(e.event_id order by c.starts_at, e.event_id))[1] as first_event,
           min(c.starts_at) as first_start
    from eligible e
    join open_cand c on c.id = e.event_id
    group by e.user_id, e.source, e.group_id
  ),
  ranked as (
    select g.*,
           row_number() over (partition by g.user_id order by g.first_start, g.group_id) as rn,
           (select count(*)::integer from public.notifications n
             where n.user_id = g.user_id and n.notification_type = 'new_game' and n.created_at >= today_start) as sent_today
    from groups g
  ),
  kept as (
    select * from ranked where rn <= 3 - sent_today
  ),
  logged as (
    insert into public.game_alert_log (user_id, event_id)
    select e.user_id, e.event_id
    from eligible e
    join kept k on k.user_id = e.user_id and k.source = e.source and k.group_id = e.group_id
    on conflict do nothing
    returning user_id, event_id
  ),
  final as (
    -- Only groups whose first game was logged in this run (a concurrent run
    -- that logged it first sends the alert instead).
    select k.*
    from kept k
    where exists (select 1 from logged l where l.user_id = k.user_id and l.event_id = k.first_event)
  )
  insert into public.notifications (user_id, notification_type, title, body, data)
  select f.user_id, 'new_game', t.title, t.body,
         jsonb_build_object(
           'event_id', c.id,
           'source', f.source,
           'count', f.n,
           'deep_link', case
             when f.n = 1 then '/event/' || c.id::text
             when f.source = 'club' then '/club/' || f.group_id::text
             else '/profile/' || f.group_id::text
           end
         )
  from final f
  join open_cand c on c.id = f.first_event
  left join public.clubs cl on f.source = 'club' and cl.id = f.group_id
  left join public.profiles hp on f.source = 'host' and hp.id = f.group_id
  cross join lateral public.new_game_alert_text(
    f.source,
    case
      when f.source = 'club' then cl.name
      else coalesce(
        nullif(btrim(coalesce(hp.first_name, '') || coalesce(' ' || nullif(left(btrim(hp.last_name), 1), '') || '.', '')), ''),
        hp.username
      )
    end,
    f.n, c.title, c.location, c.starts_at, c.going, c.max_attendees
  ) t;

  get diagnostics sent = row_count;
  return sent;
end;
$$;

comment on function public.send_new_game_alerts() is
  'pg_cron new-game-alerts (every 10 min, #170): alerts club members and regulars about games posted 10–70 minutes ago. Returns alerts sent.';

revoke execute on function public.send_new_game_alerts() from public, anon, authenticated;
revoke execute on function public.game_alert_matches(jsonb, text, text[], timestamptz) from public, anon;
revoke execute on function public.new_game_alert_text(text, text, integer, text, text, timestamptz, integer, integer) from public, anon;

select cron.schedule('new-game-alerts', '*/10 * * * *', 'select public.send_new_game_alerts()');
