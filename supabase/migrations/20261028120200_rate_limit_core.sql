-- Rate limiting core (moved here from #108 so #102's login-with-username can
-- use it; #108 adds the triggers and RPC limits on top).
--
-- A fixed-window counter per key in public.rate_limits. check_rate_limit()
-- counts a hit and says whether the key is still under its limit (edge
-- functions call it with the service role); enforce_rate_limit() raises
-- SQLSTATE PT429, which PostgREST returns as HTTP 429. Both are service-role /
-- definer only.

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.rate_limits enable row level security;
-- No policies and no client grants: only definer functions and the service role touch it.
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_key is null or p_max is null or p_window_seconds is null or p_max < 1 or p_window_seconds < 1 then
    raise exception 'check_rate_limit: key, max >= 1 and window >= 1 are required';
  end if;
  insert into public.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

create or replace function public.enforce_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.check_rate_limit(p_key, p_max, p_window_seconds) then
    raise exception using
      errcode = 'PT429',
      message = 'Too many requests. Please wait a moment and try again.',
      hint = format('Limit is %s per %s seconds.', p_max, p_window_seconds);
  end if;
end;
$$;
revoke execute on function public.enforce_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.enforce_rate_limit(text, integer, integer) to service_role;

-- Old counters are useless after their window; keep the table small.
select cron.schedule('prune-rate-limits', '41 * * * *', $cron$delete from public.rate_limits where window_start < now() - interval '1 day'$cron$);
