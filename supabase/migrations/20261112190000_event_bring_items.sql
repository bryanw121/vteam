-- What to bring (#256): hosts list the gear a game needs (net, balls, lines),
-- players who are going claim it, the reminder says what you're bringing, and
-- hosts hear 3 hours before start when a required item has no one.
--
-- Expand only: two new tables, one service-only log, four functions, one
-- trigger, a wider notification type check, a nullable template column, and
-- send_event_reminders() replaced with the same signature.
--
-- Clients never write these tables: every change goes through the SECURITY
-- DEFINER functions below. Guests read the list through get_event_bring_list
-- (counts, no names); signed-in viewers also get who is bringing what.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.event_bring_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  label      text not null check (char_length(btrim(label)) between 1 and 40),
  quantity   smallint not null default 1 check (quantity between 1 and 6),
  required   boolean not null default false,
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);
create index event_bring_items_event_id_idx on public.event_bring_items (event_id);

create table public.event_bring_claims (
  item_id    uuid not null references public.event_bring_items(id) on delete cascade,
  -- Denormalized from the item so a player's claims for one event can be released in one statement.
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  quantity   smallint not null default 1 check (quantity between 1 and 6),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index event_bring_claims_event_user_idx on public.event_bring_claims (event_id, user_id);
create index event_bring_claims_user_id_idx on public.event_bring_claims (user_id);

-- Service-only: one "nobody is bringing it" alert per event.
create table public.event_bring_alert_log (
  event_id uuid primary key references public.events(id) on delete cascade,
  sent_at  timestamptz not null default now()
);

alter table public.event_bring_items enable row level security;
alter table public.event_bring_claims enable row level security;
alter table public.event_bring_alert_log enable row level security;

create policy "Anyone can read bring items" on public.event_bring_items
  for select to anon, authenticated using (true);
create policy "Signed-in users can read bring claims" on public.event_bring_claims
  for select to authenticated using (true);

-- Read-only for clients: writes go through the functions below.
revoke all on public.event_bring_items from anon, authenticated;
grant select on public.event_bring_items to anon, authenticated;
revoke all on public.event_bring_claims from anon, authenticated;
grant select on public.event_bring_claims to authenticated;
revoke all on public.event_bring_alert_log from anon, authenticated;

alter table public.user_event_templates
  add column bring_items jsonb check (bring_items is null or jsonb_typeof(bring_items) = 'array');

-- ── Notification type ───────────────────────────────────────────────────────

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted',
    'event_cancelled', 'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned',
    'join_request', 'request_approved', 'request_denied', 'tournament_team_invite',
    'tournament_join_request', 'tournament_join_accepted', 'tournament_join_declined',
    'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention', 'event_reminder',
    'late_dropout', 'friend_request', 'friend_accepted', 'bring_item_uncovered'
  ]::text[]));

-- ── Read: the list with coverage, names for signed-in viewers only ──────────

create or replace function public.get_event_bring_list(p_event_id uuid)
returns table (
  id uuid, label text, quantity smallint, required boolean, "position" smallint,
  claimed integer, claimers jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.label, i.quantity, i.required, i.position,
         coalesce(sum(c.quantity), 0)::integer as claimed,
         case when (select auth.uid()) is null then '[]'::jsonb
              else coalesce(
                jsonb_agg(jsonb_build_object(
                  'user_id', c.user_id, 'quantity', c.quantity,
                  'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name,
                  'avatar_url', p.avatar_url
                ) order by c.created_at) filter (where c.user_id is not null),
                '[]'::jsonb)
         end as claimers
    from public.event_bring_items i
    left join public.event_bring_claims c on c.item_id = i.id
    left join public.profiles p on p.id = c.user_id
   where i.event_id = p_event_id
   group by i.id
   order by i.position, i.created_at
$$;

-- ── Write: the host's list ──────────────────────────────────────────────────

-- p_items: [{ id?, label, quantity?, required?, mine? }], in display order, at most 8.
-- Items whose id is not in the list are removed (with their claims); kept ids keep their claims.
-- `mine` = the caller is bringing it (claims what is still uncovered); false releases the caller's claim.
create or replace function public.save_event_bring_items(p_event_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_host uuid;
  v_cancelled timestamptz;
  v_item jsonb;
  v_pos integer := 0;
  v_id uuid;
  v_label text;
  v_qty integer;
  v_others integer;
  v_keep uuid[] := '{}';
begin
  if uid is null then
    raise exception 'Sign in to edit what to bring' using errcode = '28000';
  end if;
  if p_event_id is null then
    raise exception 'event is required' using errcode = '22004';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 8 then
    raise exception 'At most 8 items' using errcode = '22023';
  end if;

  select e.created_by, e.cancelled_at into v_host, v_cancelled
    from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if uid is distinct from v_host and not exists (
    select 1 from public.event_cohosts c where c.event_id = p_event_id and c.user_id = uid
  ) then
    raise exception 'Only the host or a co-host can edit what to bring' using errcode = '42501';
  end if;
  if v_cancelled is not null then
    raise exception 'This event was cancelled' using errcode = 'P0001';
  end if;
  if not public.check_rate_limit('bring_save:' || uid::text, 120, 3600) then
    raise exception 'Too many changes. Try again in a bit.' using errcode = 'P0001';
  end if;

  -- Validate everything before writing anything.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_label := btrim(coalesce(v_item->>'label', ''));
    if char_length(v_label) not between 1 and 40 then
      raise exception 'Each item needs a name of 1 to 40 characters' using errcode = '22023';
    end if;
    v_qty := coalesce((v_item->>'quantity')::integer, 1);
    if v_qty not between 1 and 6 then
      raise exception 'Quantity must be between 1 and 6' using errcode = '22023';
    end if;
    if v_item ? 'id' and v_item->>'id' is not null then
      v_keep := v_keep || (v_item->>'id')::uuid;
    end if;
  end loop;

  delete from public.event_bring_items i
   where i.event_id = p_event_id and not (i.id = any (v_keep));

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_label := btrim(v_item->>'label');
    v_qty := coalesce((v_item->>'quantity')::integer, 1);
    v_id := null;
    if v_item ? 'id' and v_item->>'id' is not null then
      update public.event_bring_items i
         set label = v_label, quantity = v_qty,
             required = coalesce((v_item->>'required')::boolean, false), position = v_pos
       where i.id = (v_item->>'id')::uuid and i.event_id = p_event_id
      returning i.id into v_id;
    end if;
    if v_id is null then
      insert into public.event_bring_items (event_id, label, quantity, required, position)
      values (p_event_id, v_label, v_qty, coalesce((v_item->>'required')::boolean, false), v_pos)
      returning event_bring_items.id into v_id;
    end if;

    if (v_item->>'mine')::boolean is true then
      select coalesce(sum(c.quantity), 0) into v_others
        from public.event_bring_claims c where c.item_id = v_id and c.user_id <> uid;
      if v_qty - v_others >= 1 then
        insert into public.event_bring_claims (item_id, event_id, user_id, quantity)
        values (v_id, p_event_id, uid, v_qty - v_others)
        on conflict (item_id, user_id) do update set quantity = excluded.quantity;
      end if;
    elsif (v_item->>'mine')::boolean is false then
      delete from public.event_bring_claims c where c.item_id = v_id and c.user_id = uid;
    end if;
    v_pos := v_pos + 1;
  end loop;
end;
$$;

-- ── Write: a player's claim ─────────────────────────────────────────────────

-- Claims up to p_quantity of what is still uncovered; returns the caller's claimed quantity.
create or replace function public.claim_bring_item(p_item_id uuid, p_quantity integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_event uuid;
  v_qty integer;
  v_host uuid;
  v_cancelled timestamptz;
  v_start timestamptz;
  v_others integer;
  v_take integer;
begin
  if uid is null then
    raise exception 'Sign in to bring something' using errcode = '28000';
  end if;
  if p_item_id is null or p_quantity is null or p_quantity not between 1 and 6 then
    raise exception 'item and a quantity of 1 to 6 are required' using errcode = '22023';
  end if;

  -- Lock the item so two claims at once can't go over its quantity.
  select i.event_id, i.quantity into v_event, v_qty
    from public.event_bring_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;

  select e.created_by, e.cancelled_at, e.event_date at time zone 'UTC'
    into v_host, v_cancelled, v_start
    from public.events e where e.id = v_event;
  if v_cancelled is not null then
    raise exception 'This event was cancelled' using errcode = 'P0001';
  end if;
  if now() >= v_start then
    raise exception 'This game has already started' using errcode = 'P0001';
  end if;
  if uid is distinct from v_host
     and not exists (select 1 from public.event_cohosts c where c.event_id = v_event and c.user_id = uid)
     and not exists (select 1 from public.event_attendees a where a.event_id = v_event and a.user_id = uid and a.status = 'attending')
  then
    raise exception 'Join the game to bring something' using errcode = '42501';
  end if;
  if not public.check_rate_limit('bring_claim:' || uid::text, 60, 3600) then
    raise exception 'Too many changes. Try again in a bit.' using errcode = 'P0001';
  end if;

  select coalesce(sum(c.quantity), 0) into v_others
    from public.event_bring_claims c where c.item_id = p_item_id and c.user_id <> uid;
  v_take := least(p_quantity, v_qty - v_others);
  if v_take < 1 then
    raise exception 'Someone is already bringing that' using errcode = 'P0001';
  end if;

  insert into public.event_bring_claims (item_id, event_id, user_id, quantity)
  values (p_item_id, v_event, uid, v_take)
  on conflict (item_id, user_id) do update set quantity = excluded.quantity;
  return v_take;
end;
$$;

create or replace function public.release_bring_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  delete from public.event_bring_claims c where c.item_id = p_item_id and c.user_id = uid;
end;
$$;

revoke execute on function public.get_event_bring_list(uuid) from public;
grant execute on function public.get_event_bring_list(uuid) to anon, authenticated;
revoke execute on function public.save_event_bring_items(uuid, jsonb) from public, anon;
grant execute on function public.save_event_bring_items(uuid, jsonb) to authenticated;
revoke execute on function public.claim_bring_item(uuid, integer) from public, anon;
grant execute on function public.claim_bring_item(uuid, integer) to authenticated;
revoke execute on function public.release_bring_item(uuid) from public, anon;
grant execute on function public.release_bring_item(uuid) to authenticated;

-- ── Leaving releases what you said you'd bring ──────────────────────────────

create or replace function public.release_bring_claims_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'attending' and (tg_op = 'DELETE' or new.status is distinct from 'attending') then
    delete from public.event_bring_claims c where c.event_id = old.event_id and c.user_id = old.user_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.release_bring_claims_on_leave() from public, anon, authenticated;

create trigger event_attendees_release_bring_claims
  after update of status or delete on public.event_attendees
  for each row execute function public.release_bring_claims_on_leave();

-- ── Reminders: "You're bringing", and a heads-up to hosts ───────────────────

create or replace function public.send_event_reminders()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  sent integer;
  alerted integer;
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
  select d.user_id, 'event_reminder', t.title,
         t.body || coalesce(' · You''re bringing: ' || b.labels, ''),
         jsonb_build_object('event_id', d.event_id, 'deep_link', '/event/' || d.event_id::text)
  from due d
  join logged g on g.event_id = d.event_id and g.user_id = d.user_id
  cross join lateral public.event_reminder_text(d.title, d.location, d.starts_at, now()) t
  left join lateral (
    select string_agg(i.label, ', ' order by i.position) as labels
      from public.event_bring_claims c
      join public.event_bring_items i on i.id = c.item_id
     where c.event_id = d.event_id and c.user_id = d.user_id
  ) b on true;

  get diagnostics sent = row_count;

  -- Hosts and co-hosts: a required item nobody is bringing, 3 hours or less before start. Once per event.
  with uncovered as (
    select e.id as event_id, e.title, e.location, (e.event_date at time zone 'UTC') as starts_at, e.created_by,
           string_agg(i.label, ', ' order by i.position) as labels
      from public.events e
      join public.event_bring_items i on i.event_id = e.id and i.required
     where e.cancelled_at is null
       and e.event_date > (now() at time zone 'UTC')
       and e.event_date <= (now() at time zone 'UTC') + interval '3 hours'
       and not exists (select 1 from public.event_bring_claims c where c.item_id = i.id)
       and not exists (select 1 from public.event_bring_alert_log a where a.event_id = e.id)
     group by e.id
  ),
  logged as (
    insert into public.event_bring_alert_log (event_id)
    select event_id from uncovered
    on conflict do nothing
    returning event_id
  ),
  recipients as (
    select u.event_id, u.created_by as user_id from uncovered u join logged g on g.event_id = u.event_id
    union
    select u.event_id, c.user_id from uncovered u join logged g on g.event_id = u.event_id
      join public.event_cohosts c on c.event_id = u.event_id
  )
  insert into public.notifications (user_id, notification_type, title, body, data)
  select r.user_id, 'bring_item_uncovered', 'Still needed: ' || u.labels,
         coalesce(nullif(btrim(u.title), ''), 'Your event') || ' · ' || t.body || ' · Nobody has said they''ll bring it.',
         jsonb_build_object('event_id', u.event_id, 'deep_link', '/event/' || u.event_id::text)
  from recipients r
  join uncovered u on u.event_id = r.event_id
  cross join lateral public.event_reminder_text(u.title, u.location, u.starts_at, now()) t
  where r.user_id is not null
    and public.notification_pref_enabled(r.user_id, 'in_app', 'bring_item_uncovered');

  get diagnostics alerted = row_count;
  return sent + alerted;
end;
$function$;

revoke execute on function public.send_event_reminders() from public, anon, authenticated;
