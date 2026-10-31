-- Event reminders and late-dropout notices (#129).
--
-- 1. notifications: two new types, event_reminder and late_dropout.
-- 2. user_settings.reminder_lead_minutes: how long before an event a player is
--    reminded (1 hour, 2 hours or a day). Turning reminders off is the existing
--    per-type pref (profiles.notification_prefs in_app.event_reminder = false).
-- 3. event_reminder_log: one row per (event, player) reminded, so nobody is
--    reminded twice. RLS on with no policies: only the definer function writes.
-- 4. send_event_reminders(): run by pg_cron every 10 minutes. Inserts one
--    informational inbox row per due attendee ("<title> at 4:00 PM" /
--    "Starts in 2 hours · <location>"); push delivery is the
--    send-notification-push edge function, called by a Database Webhook on
--    notifications INSERT (manual setup, see supabase/functions/README.md).
-- 5. notify_host_on_late_dropout(): when an attending player leaves (or is
--    removed) within 24h of the start, the host and co-hosts get late_dropout.
--
-- Expand only: a widened check constraint, a nullable-safe column with a
-- default, a new table, functions, a trigger, an index and a cron job.

-- ─── 1. Notification types ───────────────────────────────────────────────────
-- Widened in place: dropped and re-added under the same name in this file
-- (a replacement, not a removal). Every existing type is kept.
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted', 'event_cancelled',
    'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned', 'join_request', 'request_approved',
    'request_denied', 'tournament_team_invite', 'tournament_join_request', 'tournament_join_accepted',
    'tournament_join_declined', 'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention',
    'event_reminder', 'late_dropout'
  ]::text[])
);

-- ─── 2. Lead time ────────────────────────────────────────────────────────────
alter table public.user_settings
  add column if not exists reminder_lead_minutes integer not null default 120
  constraint user_settings_reminder_lead_minutes_check check (reminder_lead_minutes in (60, 120, 1440));

comment on column public.user_settings.reminder_lead_minutes is
  'Minutes before an event the player is reminded: 60, 120 (default) or 1440. Off is notification_prefs.in_app.event_reminder = false.';

-- ─── 3. Dedupe ledger ────────────────────────────────────────────────────────
create table if not exists public.event_reminder_log (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_reminder_log_user_id_idx on public.event_reminder_log (user_id);

comment on table public.event_reminder_log is
  'One row per (event, player) already reminded by send_event_reminders(). Service-only: RLS on, no policies.';

alter table public.event_reminder_log enable row level security;
revoke all on table public.event_reminder_log from anon, authenticated;

-- The reminder scan looks at events starting in the next day.
create index if not exists events_event_date_idx on public.events (event_date) where cancelled_at is null;

-- ─── 4. Reminders ────────────────────────────────────────────────────────────
-- Copy for one reminder. Pure (no table reads) so it can be checked with plain
-- selects. Times are shown in Austin time, where every event is today.
create or replace function public.event_reminder_text(
  p_title text,
  p_location text,
  p_starts_at timestamptz,
  p_now timestamptz default now()
)
returns table (title text, body text)
language plpgsql
stable
set search_path = ''
as $$
declare
  local_start timestamp := p_starts_at at time zone 'America/Chicago';
  local_now timestamp := p_now at time zone 'America/Chicago';
  clock text := to_char(local_start, 'FMHH12:MI AM');
  mins integer := greatest(0, round(extract(epoch from (p_starts_at - p_now)) / 60)::integer);
  hours integer := round(mins / 60.0)::integer;
  relative text;
begin
  if local_start::date = local_now::date + 1 then
    relative := 'Tomorrow at ' || clock;
  elsif local_start::date > local_now::date + 1 then
    relative := 'Starts ' || to_char(local_start, 'FMDay') || ' at ' || clock;
  elsif mins >= 90 then
    relative := 'Starts in ' || hours || ' hours';
  elsif mins >= 50 then
    relative := 'Starts in 1 hour';
  else
    relative := 'Starts in ' || greatest(mins, 1) || case when greatest(mins, 1) = 1 then ' minute' else ' minutes' end;
  end if;

  title := coalesce(nullif(btrim(p_title), ''), 'Your event') || ' at ' || clock;
  body := relative || coalesce(' · ' || nullif(btrim(p_location), ''), '');
  return next;
end;
$$;

comment on function public.event_reminder_text(text, text, timestamptz, timestamptz) is
  'Reminder title/body: "<title> at 4:00 PM" / "Starts in 2 hours · <location>" (America/Chicago clock).';

-- events.event_date is a timestamp without time zone holding UTC (the app appends Z).
create or replace function public.send_event_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent integer;
begin
  with due as (
    select ea.event_id, ea.user_id, e.title, e.location, (e.event_date at time zone 'UTC') as starts_at
    from public.event_attendees ea
    join public.events e on e.id = ea.event_id
    left join public.user_settings us on us.user_id = ea.user_id
    cross join lateral (select make_interval(mins => coalesce(us.reminder_lead_minutes, 120)) as lead) l
    where ea.status = 'attending'
      and e.cancelled_at is null
      and e.event_date > (now() at time zone 'UTC')
      and e.event_date <= (now() at time zone 'UTC') + interval '1 day'
      and (e.event_date at time zone 'UTC') <= now() + l.lead
      -- Joined before the window opened: no reminder right after joining.
      and coalesce(ea.joined_at at time zone 'UTC', '-infinity'::timestamptz) <= (e.event_date at time zone 'UTC') - l.lead
      and not exists (
        select 1 from public.event_reminder_log r where r.event_id = ea.event_id and r.user_id = ea.user_id
      )
      and public.notification_pref_enabled(ea.user_id, 'in_app', 'event_reminder')
  ),
  logged as (
    insert into public.event_reminder_log (event_id, user_id)
    select event_id, user_id from due
    on conflict do nothing
    returning event_id, user_id
  )
  insert into public.notifications (user_id, notification_type, title, body, data)
  select d.user_id, 'event_reminder', t.title, t.body,
         jsonb_build_object('event_id', d.event_id, 'deep_link', '/event/' || d.event_id::text)
  from due d
  join logged g on g.event_id = d.event_id and g.user_id = d.user_id
  cross join lateral public.event_reminder_text(d.title, d.location, d.starts_at, now()) t;

  get diagnostics sent = row_count;
  return sent;
end;
$$;

comment on function public.send_event_reminders() is
  'pg_cron (event-reminders, every 10 min): one event_reminder per attending player at their lead time. Never twice (event_reminder_log), never for cancelled events, never right after joining.';

revoke execute on function public.send_event_reminders() from public, anon, authenticated;
revoke execute on function public.event_reminder_text(text, text, timestamptz, timestamptz) from public, anon, authenticated;

-- ─── 5. Late dropouts ────────────────────────────────────────────────────────
create or replace function public.notify_host_on_late_dropout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev record;
  who text;
  waiting integer;
begin
  if OLD.status is distinct from 'attending' then
    return OLD;
  end if;

  -- A cascade from a deleted event finds no event row here: nothing to say.
  select e.id, e.title, e.created_by, (e.event_date at time zone 'UTC') as starts_at
    into ev
  from public.events e
  where e.id = OLD.event_id
    and e.cancelled_at is null
    and e.event_date > (now() at time zone 'UTC')
    and e.event_date <= (now() at time zone 'UTC') + interval '24 hours';
  if not found then
    return OLD;
  end if;

  select coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.username, 'A player')
    into who
  from public.profiles p where p.id = OLD.user_id;
  who := coalesce(who, 'A player');

  select count(*) into waiting
  from public.event_attendees ea
  where ea.event_id = OLD.event_id and ea.status = 'waitlisted';

  -- Best effort: a notice must never stop someone leaving.
  begin
    insert into public.notifications (user_id, notification_type, title, body, data)
    select r.user_id, 'late_dropout',
           who || ' dropped out of ' || coalesce(nullif(btrim(ev.title), ''), 'your event'),
           'Starts at ' || to_char(ev.starts_at at time zone 'America/Chicago', 'FMHH12:MI AM')
             || case when waiting = 1 then '. 1 person is on the waitlist.'
                     when waiting > 1 then '. ' || waiting || ' people are on the waitlist.'
                     else '. A spot is open.' end,
           jsonb_build_object('event_id', OLD.event_id, 'user_id', OLD.user_id, 'deep_link', '/event/' || OLD.event_id::text || '?tab=1')
    from (
      select ev.created_by as user_id
      union
      select c.user_id from public.event_cohosts c where c.event_id = OLD.event_id
    ) r
    where r.user_id is not null
      and r.user_id <> OLD.user_id
      and r.user_id is distinct from auth.uid()
      and public.notification_pref_enabled(r.user_id, 'in_app', 'late_dropout');
  exception when others then
    raise warning 'notify_host_on_late_dropout: %', sqlerrm;
  end;

  return OLD;
end;
$$;

comment on function public.notify_host_on_late_dropout() is
  'AFTER DELETE on event_attendees: an attending player left within 24h of the start; tell the host and co-hosts (not the person who made the change).';

revoke execute on function public.notify_host_on_late_dropout() from public, anon, authenticated;

drop trigger if exists trg_event_attendees_late_dropout on public.event_attendees;
create trigger trg_event_attendees_late_dropout
  after delete on public.event_attendees
  for each row execute function public.notify_host_on_late_dropout();

-- ─── 6. Schedule ─────────────────────────────────────────────────────────────
-- Runs on beta too: only the e2e accounts exist there and no edge functions are
-- deployed, so nothing is pushed.
select cron.unschedule(jobid) from cron.job where jobname = 'event-reminders';
select cron.schedule('event-reminders', '*/10 * * * *', 'select public.send_event_reminders()');
