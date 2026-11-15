-- #316: job_health() also reports app crashes (app_events name = 'app_crash'), counts only.
create or replace function public.job_health()
returns table (check_name text, ok boolean, last_ok_at timestamptz, failures_24h integer, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select 'cron: ' || j.jobname,
         j.active,
         (select max(d.end_time) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'succeeded'),
         (select count(*)::integer from cron.job_run_details d
           where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours'),
         case when j.active then 'active' else 'inactive' end
  from cron.job j;

  return query
  select 'feed: external_sessions'::text, true, max(s.updated_at), 0, count(*) || ' rows'
  from public.external_sessions s where s.region = 'austin';

  return query
  select 'feed: external_programs'::text, true, max(p.updated_at), 0, count(*) || ' rows'
  from public.external_programs p;

  return query
  select 'points: unpaid attendees'::text,
         count(*) = 0,
         null::timestamptz,
         count(*)::integer,
         count(*) || ' attendees in ' || count(distinct e.id) || ' events'
  from public.events e
  join public.event_attendees ea on ea.event_id = e.id and ea.status = 'attending'
  where e.cancelled_at is null
    and e.event_date + make_interval(mins => e.duration_minutes) + interval '3 hours' <= now()
    and e.event_date + make_interval(mins => e.duration_minutes) > now() - interval '7 days'
    and not ea.no_show
    and (ea.joined_at is null or ea.joined_at <= e.event_date + make_interval(mins => e.duration_minutes))
    and not exists (
      select 1 from public.point_events pe
      where pe.user_id = ea.user_id and pe.event_id = e.id and pe.reason = 'event_attended'
    );

  -- App crashes (#316): the error screen records app_crash. Fails when 3+ people
  -- or devices crashed in 3 hours (test accounts left out). Counts only.
  return query
  select 'app: crashes'::text,
         count(distinct coalesce(a.user_id::text, a.anon_id)) filter (where a.created_at > now() - interval '3 hours') < 3,
         null::timestamptz,
         count(*)::integer,
         count(*) || ' crashes from ' || count(distinct coalesce(a.user_id::text, a.anon_id)) || ' people in 24h; '
           || count(distinct coalesce(a.user_id::text, a.anon_id)) filter (where a.created_at > now() - interval '3 hours') || ' in 3h'
  from public.app_events a
  where a.name = 'app_crash'
    and a.created_at > now() - interval '24 hours'
    and (a.user_id is null or not exists (select 1 from public.metrics_excluded_users x where x.user_id = a.user_id));

  if to_regclass('net._http_response') is not null then
    return query execute $q$
      select 'pg_net: responses'::text,
             count(*) filter (where x.bad) = 0,
             max(x.created) filter (where not x.bad),
             (count(*) filter (where x.bad))::integer,
             (count(*) filter (where x.bad)) || ' of ' || count(*) || ' failed in 24h'
      from (
        select r.created, (r.timed_out or r.status_code is null or r.status_code >= 300) as bad
        from net._http_response r
        where r.created > now() - interval '24 hours'
      ) x
    $q$;
  end if;
end;
$$;

revoke all on function public.job_health() from public;
grant execute on function public.job_health() to anon, authenticated;
