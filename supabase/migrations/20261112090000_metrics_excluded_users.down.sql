-- Undo 20261112090000_metrics_excluded_users.sql: restore admin_metrics_overview as in
-- 20261111120000_admin_metrics.sql (counts every account), then drop the list.

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

drop table if exists public.metrics_excluded_users;
