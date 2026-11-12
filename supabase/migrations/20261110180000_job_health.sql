-- #157: one read-only health report on the background work players depend on,
-- for scripts/job-health.mjs (scheduled every 3 hours by job-health.yml, which
-- emails the owner when a check fails). Returns aggregates only: job names,
-- times and counts. No error messages, SQL, ids or user data.
--
-- Rows (check_name):
--   cron: <job>                every pg_cron job: active?, last successful run, failed runs in 24h
--   feed: external_sessions    newest import (Austin) / feed: external_programs newest import
--   points: unpaid attendees   attendees award_event_points() should have paid
--                              over an hour ago and didn't (same rules as that function)
--   pg_net: responses          non-2xx / timed-out HTTP responses in 24h (the push webhook);
--                              only where pg_net is installed
-- The script decides what is "too old" per job; `ok` is set here only where the
-- answer doesn't depend on a schedule.
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
