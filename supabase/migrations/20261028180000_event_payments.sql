-- #6: "I've paid" self-toggle for paid events.
--
-- A row means "this attendee says they've paid for this event". It lives in its
-- own table, not a column on event_attendees, because attendee rows are public
-- (guests read rosters) while payment status is only for the attendee and the
-- event's host and co-hosts. Presence is the flag: the attendee inserts their
-- own row to mark paid and deletes it to clear. Nobody else can write it, and
-- there is no UPDATE.
--
-- Leaving the event removes the attendee row, which removes the flag
-- (ON DELETE CASCADE), so a re-join starts unpaid.
-- Additive only: a new table, policies and grants.

create table public.event_payments (
  event_id uuid not null,
  user_id  uuid not null,
  paid_at  timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (event_id, user_id)
    references public.event_attendees (event_id, user_id) on delete cascade
);

comment on table public.event_payments is
  'Self-reported "I''ve paid" flags for paid events (#6). Row present = attendee marked paid. Readable by the attendee and the event host/co-hosts.';

alter table public.event_payments enable row level security;

-- The attendee sees their own flag; the host and co-hosts see everyone's.
create policy event_payments_select on public.event_payments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = event_payments.event_id and e.created_by = (select auth.uid())
    )
    or exists (
      select 1 from public.event_cohosts c
      where c.event_id = event_payments.event_id and c.user_id = (select auth.uid())
    )
  );

-- Only for yourself, only on a paid event, only while you're on its roster
-- (attending or waitlisted).
create policy event_payments_insert_own on public.event_payments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_payments.event_id and e.price > 0
    )
    and exists (
      select 1 from public.event_attendees a
      where a.event_id = event_payments.event_id
        and a.user_id = (select auth.uid())
        and a.status in ('attending', 'waitlisted')
    )
  );

create policy event_payments_delete_own on public.event_payments
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.event_payments from anon, authenticated;
grant select, delete on public.event_payments to authenticated;
-- paid_at always comes from the default, never the client.
grant insert (event_id, user_id) on public.event_payments to authenticated;
