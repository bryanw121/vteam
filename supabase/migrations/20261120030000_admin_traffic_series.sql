-- Admin metrics → Live: traffic over a chosen span (1 hour to 30 days), not only the last hour.
-- admin_traffic_series(p_minutes) returns, in evenly sized buckets (at most ~90 points):
--   people online (peak and average, from the per-minute app_online_samples, kept 30 days), and
--   visits: sessions opened (app_sessions.started_at), split into signed-in and guest.
-- A visit is one launch of the app or site by one device; a guest is a device with no account
-- signed in (app_sessions.anon_id, a random id kept on the device). Totals add unique visitors
-- and screen views. Accounts in metrics_excluded_users (test accounts) are left out of visits.
-- Admins only, like the other admin_* functions; aggregates only, no ids.

create or replace function public.admin_traffic_series(p_minutes integer default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_minutes integer := least(greatest(coalesce(p_minutes, 60), 60), 43200);
  -- Bucket size by span: 1 h → 1 min, 3 h → 2 min, 12 h → 10 min, 1 d → 20 min, 3 d → 1 h, 1 wk → 2 h, 30 d → 8 h.
  v_bucket integer := case
    when v_minutes <= 60 then 60
    when v_minutes <= 180 then 120
    when v_minutes <= 720 then 600
    when v_minutes <= 1440 then 1200
    when v_minutes <= 4320 then 3600
    when v_minutes <= 10080 then 7200
    else 28800 end;
  v_to timestamptz := to_timestamp(floor(extract(epoch from now()) / v_bucket) * v_bucket + v_bucket);
  v_from timestamptz := v_to - make_interval(mins => v_minutes);
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  with
  buckets as (
    select g as at from generate_series(v_from, v_to - make_interval(secs => v_bucket), make_interval(secs => v_bucket)) g
  ),
  online as (
    select to_timestamp(floor(extract(epoch from s.at) / v_bucket) * v_bucket) as at,
           max(s.online)::integer as peak, round(avg(s.online), 1) as average
    from public.app_online_samples s
    where s.at >= v_from and s.at < v_to
    group by 1
  ),
  sessions as (
    select s.started_at, s.user_id, coalesce(s.user_id::text, s.anon_id) as who
    from public.app_sessions s
    where s.started_at >= v_from and s.started_at < v_to
      and not exists (select 1 from public.metrics_excluded_users x where x.user_id = s.user_id)
  ),
  visits as (
    select to_timestamp(floor(extract(epoch from started_at) / v_bucket) * v_bucket) as at,
           count(*)::integer as visits, count(*) filter (where user_id is null)::integer as guest_visits
    from sessions group by 1
  )
  select jsonb_build_object(
    'from', v_from, 'to', v_to, 'minutes', v_minutes, 'bucket_seconds', v_bucket,
    'points', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', b.at, 'online', o.peak, 'online_avg', o.average,
        'visits', coalesce(v.visits, 0), 'guest_visits', coalesce(v.guest_visits, 0)
      ) order by b.at)
      from buckets b left join online o on o.at = b.at left join visits v on v.at = b.at
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'visits', (select count(*) from sessions),
      'guest_visits', (select count(*) from sessions where user_id is null),
      'visitors', (select count(distinct who) from sessions),
      'guest_visitors', (select count(distinct who) from sessions where user_id is null),
      'signed_in_visitors', (select count(distinct who) from sessions where user_id is not null),
      'screen_views', (
        select count(*) from public.app_events e
        where e.name = 'screen_view' and e.created_at >= v_from and e.created_at < v_to
          and not exists (select 1 from public.metrics_excluded_users x where x.user_id = e.user_id)
      ),
      'peak', (
        select jsonb_build_object('online', s.online, 'at', s.at)
        from public.app_online_samples s where s.at >= v_from and s.at < v_to
        order by s.online desc, s.at desc limit 1
      )
    )
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.admin_traffic_series(integer) from public, anon;
grant execute on function public.admin_traffic_series(integer) to authenticated;

-- Visits are looked up by start time; sessions are kept 180 days.
create index if not exists app_sessions_started_at_idx on public.app_sessions (started_at);
