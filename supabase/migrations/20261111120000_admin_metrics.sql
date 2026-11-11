-- Usage metrics, part 2: the admin functions behind Profile → Admin metrics.
--
-- Design: the "vteam usage metrics" doc (Nov 10). Part 1 (20261110230000_usage_sessions) collects
-- sessions, heartbeats, minute samples and daily peaks; no client can read any of it. These
-- functions are the only way to: each is SECURITY DEFINER, executable by signed-in users only,
-- and raises 42501 unless current_user_is_admin() (app_admins) says the caller is an admin.
--
--   admin_metrics_overview(from, to)  headline numbers, daily series, platforms, versions,
--                                     top screens, actions and the feed → RSVP funnel
--   admin_online_now()                online now by platform and screen, the last hour, today's
--                                     peak, and who is online
--   admin_retention(weeks)            weekly sign-up cohorts, and guest devices that signed in
--   admin_users(search, sort, limit, offset)  the people list
--   admin_user_activity(user)         one person
--
-- Days are America/Chicago days, like app_online_daily. A person is a signed-in account, else a
-- device (anon_id). Screen types only (e.g. /event/[id]): no function returns which event or
-- profile anyone viewed.
--
-- Additive only (new functions). Idempotent.

-- '1.6.0' → {1,6,0}; anything that isn't dotted numbers → null. For "old build" checks.
create or replace function public.app_version_key(p_version text)
returns integer[]
language sql
immutable
set search_path = ''
as $function$
  select case when p_version ~ '^[0-9]{1,6}(\.[0-9]{1,6}){0,3}$' then string_to_array(p_version, '.')::integer[] end
$function$;
revoke all on function public.app_version_key(text) from public, anon, authenticated;

create or replace function public.admin_metrics_overview(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  tz constant text := 'America/Chicago';
  v_today date := (now() at time zone tz)::date;
  v_from date;
  v_to date;
  v_days integer;
  v_lo date;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  v_to := least(coalesce(p_to, v_today), v_today);
  v_from := greatest(coalesce(p_from, v_to - 29), v_to - 365);
  if v_from > v_to then v_from := v_to; end if;
  v_days := v_to - v_from + 1;
  -- Activity is read back far enough for the prior period and a 30-day MAU.
  v_lo := least(v_from - v_days, v_to - 29);
  v_start := v_from::timestamp at time zone tz;
  v_end := (v_to + 1)::timestamp at time zone tz;

  with
  sess as (
    select s.id, coalesce(s.user_id::text, s.anon_id) as who, s.user_id, s.anon_id, s.platform,
           s.app_version, s.started_at, s.last_seen
    from public.app_sessions s
    where s.last_seen >= (v_lo::timestamp at time zone tz) and s.started_at < v_end
  ),
  act as (
    select distinct sess.who, sess.platform, d.day
    from sess
    cross join lateral (values ((sess.started_at at time zone tz)::date), ((sess.last_seen at time zone tz)::date)) d(day)
  ),
  days as (
    select g::date as day from generate_series(v_lo::timestamp, v_to::timestamp, interval '1 day') g
  ),
  daily as (
    select d.day, count(distinct a.who)::integer as active
    from days d left join act a on a.day = d.day
    group by d.day
  ),
  peaks as (
    select o.day, o.peak, o.peak_at from public.app_online_daily o where o.day between v_from and v_to
    union all
    select v_today, max(s.online), (array_agg(s.at order by s.online desc, s.at))[1]
    from public.app_online_samples s
    where s.at >= (v_today::timestamp at time zone tz)
    having count(*) > 0 and v_today between v_from and v_to
  ),
  cur_sessions as (
    select * from sess where sess.started_at >= v_start and sess.started_at < v_end
  ),
  live as (
    select distinct on (who) who, user_id from public.app_sessions s2
    cross join lateral (select coalesce(s2.user_id::text, s2.anon_id) as who) w
    where s2.last_seen > now() - interval '90 seconds'
    order by who, s2.last_seen desc
  ),
  native_latest as (
    select distinct on (who) who, platform, app_version
    from sess
    where platform in ('ios', 'android') and last_seen > now() - interval '30 days'
    order by who, last_seen desc
  ),
  newest as (
    select max(public.app_version_key(app_version)) as k from native_latest
  ),
  screen_events as (
    select coalesce(e.user_id::text, e.anon_id) as who, e.user_id, e.props->>'screen' as screen
    from public.app_events e
    where e.name = 'screen_view' and e.created_at >= v_start and e.created_at < v_end
  ),
  funnel_feed as (select distinct who, user_id from screen_events where screen = '/'),
  funnel_event as (
    select distinct f.who, f.user_id from funnel_feed f
    where exists (select 1 from screen_events x where x.who = f.who and x.screen = '/event/[id]')
  ),
  funnel_rsvp as (
    select f.who from funnel_event f
    where f.user_id is not null
      and exists (select 1 from public.event_attendees ea
                  where ea.user_id = f.user_id and ea.joined_at >= v_start and ea.joined_at < v_end)
  ),
  signups as (
    select p.id, p.created_at from public.profiles p where p.created_at >= v_start and p.created_at < v_end
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'online', jsonb_build_object(
      'now', (select count(*) from live),
      'signed_in', (select count(*) from live where user_id is not null),
      'guests', (select count(*) from live where user_id is null)
    ),
    'dau_avg', (select round(avg(active)::numeric, 1) from daily where day between v_from and v_to),
    'dau_avg_prev', (select round(avg(active)::numeric, 1) from daily where day between v_from - v_days and v_from - 1),
    'wau', (select count(distinct who) from act where day between v_to - 6 and v_to),
    'wau_prev', (select count(distinct who) from act where day between v_to - 13 and v_to - 7),
    'mau', (select count(distinct who) from act where day between v_to - 29 and v_to),
    'accounts', (select count(*) from public.profiles),
    'signups', (select count(*) from signups),
    'signups_from_guests', (
      select count(*) from signups su
      where exists (
        select 1 from public.app_sessions g
        where g.started_at < su.created_at
          and g.anon_id in (select u.anon_id from public.app_sessions u where u.user_id = su.id)
      )
    ),
    'sessions', (select count(*) from cur_sessions),
    'median_session_s', (
      select round(percentile_cont(0.5) within group (order by extract(epoch from last_seen - started_at))::numeric)
      from cur_sessions
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'active', d.active, 'peak', p.peak, 'peak_at', p.peak_at) order by d.day)
      from daily d left join peaks p on p.day = d.day
      where d.day between v_from and v_to
    ), '[]'::jsonb),
    'platforms', coalesce((
      select jsonb_object_agg(platform, n)
      from (select platform, count(distinct who)::integer as n from act where day between v_from and v_to group by platform) x
    ), '{}'::jsonb),
    'versions', jsonb_build_object(
      'newest', (select array_to_string(k, '.') from newest),
      'behind', (
        select count(*) from native_latest nl, newest
        where newest.k is not null and public.app_version_key(nl.app_version) < newest.k
      )
    ),
    'top_screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', screen, 'views', views, 'people', people) order by views desc, screen)
      from (
        select screen, count(*)::integer as views, count(distinct who)::integer as people
        from screen_events where screen is not null group by screen order by views desc, screen limit 8
      ) x
    ), '[]'::jsonb),
    'actions', jsonb_build_object(
      'rsvps', (select count(*) from public.event_attendees ea where ea.joined_at >= v_start and ea.joined_at < v_end),
      'hosted', (select count(*) from public.events ev where ev.created_at >= v_start and ev.created_at < v_end and ev.created_by is not null),
      'messages', (select count(*) from public.messages m where m.created_at >= v_start and m.created_at < v_end),
      'kudos', (select count(*) from public.cheers c where c.created_at >= v_start and c.created_at < v_end),
      'friend_requests', (select count(*) from public.friend_requests fr where fr.created_at >= v_start and fr.created_at < v_end),
      'clubs_joined', (select count(*) from public.club_members cm where cm.joined_at >= v_start and cm.joined_at < v_end),
      'outside_links', (select count(*) from public.app_events e where e.name = 'outside_link_opened' and e.created_at >= v_start and e.created_at < v_end)
    ),
    'funnel', jsonb_build_object(
      'feed', (select count(*) from funnel_feed),
      'event', (select count(*) from funnel_event),
      'rsvp', (select count(*) from funnel_rsvp)
    )
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_metrics_overview(date, date) from public, anon;
grant execute on function public.admin_metrics_overview(date, date) to authenticated;

create or replace function public.admin_online_now()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  tz constant text := 'America/Chicago';
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  with
  latest as (
    select distinct on (w.who) w.who, s.user_id, s.platform, s.app_version, s.screen, s.started_at
    from public.app_sessions s
    cross join lateral (select coalesce(s.user_id::text, s.anon_id) as who) w
    where s.last_seen > now() - interval '90 seconds'
    order by w.who, s.last_seen desc
  )
  select jsonb_build_object(
    'at', now(),
    'online', (select count(*) from latest),
    'signed_in', (select count(*) from latest where user_id is not null),
    'guests', (select count(*) from latest where user_id is null),
    'by_platform', coalesce((
      select jsonb_object_agg(platform, n) from (select platform, count(*)::integer as n from latest group by platform) x
    ), '{}'::jsonb),
    'by_screen', coalesce((
      select jsonb_agg(jsonb_build_object('screen', screen, 'people', n) order by n desc, screen)
      from (select screen, count(*)::integer as n from latest where screen is not null group by screen) x
    ), '[]'::jsonb),
    'last_hour', coalesce((
      select jsonb_agg(jsonb_build_object('at', s.at, 'online', s.online) order by s.at)
      from public.app_online_samples s where s.at > now() - interval '60 minutes'
    ), '[]'::jsonb),
    'today_peak', (
      select jsonb_build_object('peak', s.online, 'at', s.at)
      from public.app_online_samples s
      where s.at >= ((now() at time zone tz)::date::timestamp at time zone tz)
      order by s.online desc, s.at limit 1
    ),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', l.user_id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name,
        'avatar_url', p.avatar_url, 'screen', l.screen, 'platform', l.platform, 'app_version', l.app_version,
        'started_at', l.started_at
      ) order by l.started_at)
      from latest l join public.profiles p on p.id = l.user_id
    ), '[]'::jsonb),
    'guest_screens', coalesce((
      select jsonb_agg(distinct l.screen) from latest l where l.user_id is null and l.screen is not null
    ), '[]'::jsonb),
    'guest_platforms', coalesce((
      select jsonb_agg(distinct l.platform) from latest l where l.user_id is null
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_online_now() from public, anon;
grant execute on function public.admin_online_now() to authenticated;

-- Of each week's sign-ups (weeks start Monday), how many were active again 1, 2, 4 and 8 weeks
-- later; null where that week hasn't finished yet. Plus guest devices from the last 30 days and
-- how many of them later signed in on the same device.
create or replace function public.admin_retention(p_weeks integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  tz constant text := 'America/Chicago';
  v_today date := (now() at time zone tz)::date;
  v_weeks integer := least(greatest(coalesce(p_weeks, 12), 1), 52);
  v_first date;
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  v_first := date_trunc('week', v_today::timestamp)::date - 7 * (v_weeks - 1);

  with
  c as (
    select p.id, date_trunc('week', p.created_at at time zone tz)::date as wk
    from public.profiles p
    where p.created_at >= (v_first::timestamp at time zone tz)
  ),
  ud as (
    select distinct s.user_id, d.day
    from public.app_sessions s
    cross join lateral (values ((s.started_at at time zone tz)::date), ((s.last_seen at time zone tz)::date)) d(day)
    where s.user_id in (select id from c)
  ),
  cohorts as (
    select c.wk, count(*)::integer as size,
      case when c.wk + 14 > v_today then null else count(*) filter (
        where exists (select 1 from ud where ud.user_id = c.id and ud.day between c.wk + 7 and c.wk + 13)) end as w1,
      case when c.wk + 21 > v_today then null else count(*) filter (
        where exists (select 1 from ud where ud.user_id = c.id and ud.day between c.wk + 14 and c.wk + 20)) end as w2,
      case when c.wk + 35 > v_today then null else count(*) filter (
        where exists (select 1 from ud where ud.user_id = c.id and ud.day between c.wk + 28 and c.wk + 34)) end as w4,
      case when c.wk + 63 > v_today then null else count(*) filter (
        where exists (select 1 from ud where ud.user_id = c.id and ud.day between c.wk + 56 and c.wk + 62)) end as w8
    from c group by c.wk
  ),
  guest_devices as (
    select g.anon_id, min(g.started_at) as first_at
    from public.app_sessions g
    where g.user_id is null and g.started_at > now() - interval '30 days'
    group by g.anon_id
  )
  select jsonb_build_object(
    'cohorts', coalesce((
      select jsonb_agg(jsonb_build_object('week', wk, 'size', size, 'w1', w1, 'w2', w2, 'w4', w4, 'w8', w8) order by wk)
      from cohorts
    ), '[]'::jsonb),
    'guest_devices', (select count(*) from guest_devices),
    'guest_converted', (
      select count(*) from guest_devices gd
      where exists (
        select 1 from public.app_sessions u
        where u.anon_id = gd.anon_id and u.user_id is not null and u.last_seen >= gd.first_at
      )
    )
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_retention(integer) from public, anon;
grant execute on function public.admin_retention(integer) to authenticated;

-- Every account, searchable by name or username. p_sort: 'last_seen' (default), 'active'
-- (sessions in 30 days) or 'newest'.
create or replace function public.admin_users(
  p_search text default null,
  p_sort text default 'last_seen',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_q text := nullif(btrim(left(coalesce(p_search, ''), 60)), '');
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if v_q is not null then
    v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with
  last_s as (
    select distinct on (s.user_id) s.user_id, s.last_seen, s.platform, s.app_version
    from public.app_sessions s where s.user_id is not null
    order by s.user_id, s.last_seen desc
  ),
  s30 as (
    select s.user_id, count(*)::integer as n
    from public.app_sessions s
    where s.user_id is not null and s.started_at > now() - interval '30 days'
    group by s.user_id
  ),
  newest as (
    select max(public.app_version_key(l.app_version)) as k
    from last_s l where l.platform in ('ios', 'android') and l.last_seen > now() - interval '30 days'
  ),
  base as (
    select p.id, p.username, p.first_name, p.last_name, p.avatar_url, p.created_at,
           l.last_seen, l.platform, l.app_version, coalesce(s30.n, 0) as sessions_30d
    from public.profiles p
    left join last_s l on l.user_id = p.id
    left join s30 on s30.user_id = p.id
    where v_pattern is null
       or p.username ilike v_pattern
       or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_pattern
  ),
  ranked as (
    select b.*, row_number() over (
      order by
        case when p_sort = 'active' then b.sessions_30d end desc nulls last,
        case when p_sort = 'newest' then b.created_at end desc nulls last,
        b.last_seen desc nulls last,
        b.created_at desc nulls last,
        b.id
    ) as ord
    from base b
  ),
  page as (
    select * from ranked where ord > v_offset and ord <= v_offset + v_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'active_30d', (select count(*) from base where last_seen > now() - interval '30 days'),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pg.id, 'username', pg.username, 'first_name', pg.first_name, 'last_name', pg.last_name,
        'avatar_url', pg.avatar_url, 'created_at', pg.created_at, 'last_seen', pg.last_seen,
        'online', coalesce(pg.last_seen > now() - interval '90 seconds', false),
        'platform', pg.platform, 'app_version', pg.app_version, 'sessions_30d', pg.sessions_30d,
        'old_build', coalesce(pg.platform in ('ios', 'android') and public.app_version_key(pg.app_version) < newest.k, false)
      ) order by pg.ord)
      from page pg, newest
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_users(text, text, integer, integer) from public, anon;
grant execute on function public.admin_users(text, text, integer, integer) to authenticated;

-- One person: who they are, how they first came, platforms, the last 35 days of activity,
-- totals, and their 10 most recent sessions with the screen types they went through.
create or replace function public.admin_user_activity(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  tz constant text := 'America/Chicago';
  v_today date := (now() at time zone tz)::date;
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    return null;
  end if;

  with
  mine as (
    select s.* from public.app_sessions s where s.user_id = p_user
  ),
  latest as (
    select * from mine order by last_seen desc limit 1
  ),
  recent as (
    select * from mine order by started_at desc limit 10
  ),
  days as (
    select g::date as day from generate_series((v_today - 34)::timestamp, v_today::timestamp, interval '1 day') g
  )
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at,
    'first_seen_as_guest', (
      select min(g.started_at) from public.app_sessions g
      where g.anon_id in (select anon_id from mine)
        and (g.user_id is null or g.user_id = p_user)
        and g.started_at < p.created_at
    ),
    'platforms', coalesce((select jsonb_agg(distinct platform) from mine), '[]'::jsonb),
    'last_seen', (select last_seen from latest),
    'online', coalesce((select last_seen > now() - interval '90 seconds' from latest), false),
    'screen', (select screen from latest),
    'platform', (select platform from latest),
    'app_version', (select app_version from latest),
    'sessions_30d', (select count(*) from mine where started_at > now() - interval '30 days'),
    'median_session_s', (
      select round(percentile_cont(0.5) within group (order by extract(epoch from last_seen - started_at))::numeric)
      from mine where started_at > now() - interval '30 days'
    ),
    'days', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'minutes', coalesce(m.minutes, 0)) order by d.day)
      from days d
      left join (
        select (started_at at time zone tz)::date as day,
               round(sum(extract(epoch from last_seen - started_at)) / 60)::integer as minutes
        from mine group by 1
      ) m on m.day = d.day
    ),
    'rsvps', (select count(*) from public.event_attendees ea where ea.user_id = p_user),
    'hosted', (select count(*) from public.events ev where ev.created_by = p_user),
    'kudos_given', (select count(*) from public.cheers c where c.giver_id = p_user),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'started_at', r.started_at, 'last_seen', r.last_seen, 'platform', r.platform,
        'app_version', r.app_version,
        'screens', coalesce((
          select jsonb_agg(x.screen order by x.created_at)
          from (
            select e.props->>'screen' as screen, e.created_at
            from public.app_events e
            where e.session_id = r.id and e.name = 'screen_view' and e.props ? 'screen'
            order by e.created_at limit 40
          ) x
        ), '[]'::jsonb)
      ) order by r.started_at desc)
      from recent r
    ), '[]'::jsonb)
  ) into v_result
  from public.profiles p
  where p.id = p_user;
  return v_result;
end;
$function$;
revoke all on function public.admin_user_activity(uuid) from public, anon;
grant execute on function public.admin_user_activity(uuid) to authenticated;
