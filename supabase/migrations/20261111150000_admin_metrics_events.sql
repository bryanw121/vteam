-- Usage metrics, part 3: what the new client events add to Admin metrics → Overview.
--
-- The app now records outside_link_opened {kind, org}, share_tapped {surface, method},
-- feed_filter_changed {filter, surface} and scorekeeper_match {stage, sets} in app_events
-- (constants/analytics.ts). admin_metrics_events(from, to) counts them for the same America/Chicago
-- range as admin_metrics_overview, plus the guest funnel: guest devices → signed in on the same
-- device → RSVPed. Same safety as part 2: SECURITY DEFINER, signed-in callers only, raises 42501
-- unless current_user_is_admin().
--
-- Additive only (one new function). Idempotent.

create or replace function public.admin_metrics_events(p_from date default null, p_to date default null)
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
  v_start := v_from::timestamp at time zone tz;
  v_end := (v_to + 1)::timestamp at time zone tz;

  with
  ev as (
    select e.name, e.props, coalesce(e.user_id::text, e.anon_id) as who
    from public.app_events e
    where e.created_at >= v_start and e.created_at < v_end
      and e.name in ('outside_link_opened', 'share_tapped', 'feed_filter_changed', 'scorekeeper_match')
  ),
  outside as (select props->>'kind' as kind, props->>'org' as org, who from ev where name = 'outside_link_opened'),
  shares as (select props->>'method' as method, who from ev where name = 'share_tapped'),
  filters as (select props->>'filter' as filter, props->>'surface' as surface, who from ev where name = 'feed_filter_changed'),
  matches as (select props->>'stage' as stage, who from ev where name = 'scorekeeper_match'),
  guests as (
    select g.anon_id, min(g.started_at) as first_at
    from public.app_sessions g
    where g.user_id is null and g.started_at >= v_start and g.started_at < v_end
    group by g.anon_id
  ),
  converted as (
    select gd.anon_id, u.user_id, min(u.started_at) as signed_in_at
    from guests gd
    join public.app_sessions u on u.anon_id = gd.anon_id and u.user_id is not null and u.last_seen >= gd.first_at
    group by gd.anon_id, u.user_id
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'outside_links', jsonb_build_object(
      'taps', (select count(*) from outside),
      'people', (select count(distinct who) from outside),
      'by_kind', coalesce((
        select jsonb_object_agg(kind, n) from (select coalesce(kind, 'unknown') as kind, count(*)::integer as n from outside group by 1) x
      ), '{}'::jsonb),
      'top_orgs', coalesce((
        select jsonb_agg(jsonb_build_object('org', org, 'taps', taps, 'people', people) order by taps desc, org)
        from (
          select coalesce(org, 'unknown') as org, count(*)::integer as taps, count(distinct who)::integer as people
          from outside group by 1 order by taps desc, org limit 8
        ) x
      ), '[]'::jsonb)
    ),
    'shares', jsonb_build_object(
      'taps', (select count(*) from shares),
      'people', (select count(distinct who) from shares),
      'by_method', coalesce((
        select jsonb_object_agg(method, n) from (select coalesce(method, 'unknown') as method, count(*)::integer as n from shares group by 1) x
      ), '{}'::jsonb)
    ),
    'filters', coalesce((
      select jsonb_agg(jsonb_build_object('filter', filter, 'surface', surface, 'times', times, 'people', people) order by times desc, filter, surface)
      from (
        select coalesce(filter, 'all') as filter, coalesce(surface, 'all') as surface,
               count(*)::integer as times, count(distinct who)::integer as people
        from filters group by 1, 2 order by times desc limit 8
      ) x
    ), '[]'::jsonb),
    'scorekeeper', jsonb_build_object(
      'started', (select count(*) from matches where stage = 'started'),
      'finished', (select count(*) from matches where stage = 'finished'),
      'people', (select count(distinct who) from matches)
    ),
    'guest_funnel', jsonb_build_object(
      'guests', (select count(*) from guests),
      'signed_in', (select count(distinct anon_id) from converted),
      'rsvped', (
        select count(distinct c.anon_id) from converted c
        where exists (
          select 1 from public.event_attendees ea
          where ea.user_id = c.user_id and ea.joined_at >= c.signed_in_at
        )
      )
    )
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_metrics_events(date, date) from public, anon;
grant execute on function public.admin_metrics_events(date, date) to authenticated;
