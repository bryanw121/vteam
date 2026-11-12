-- #194: one notification per game for cheers, and one per event for edits.
--
-- Expand only: three nullable/defaulted columns, two indexes, two helper
-- functions, and the two trigger functions replaced. A cheer for a receiver
-- who already has an UNREAD cheers row for that event folds into it
-- (INSERT ... ON CONFLICT on the partial unique index); otherwise it inserts a
-- new row. The push webhook fires on INSERT only, so folding sends no push.
-- Host edits to an event fold the same way per attendee while unread.

alter table public.notifications
  add column if not exists group_key text,
  add column if not exists group_count integer not null default 1,
  add column if not exists last_activity_at timestamptz not null default now();

-- Existing rows sort by when they were created.
update public.notifications set last_activity_at = created_at where last_activity_at is distinct from created_at;

create unique index if not exists notifications_open_group_uidx
  on public.notifications (user_id, group_key)
  where read_at is null and group_key is not null;

create index if not exists notifications_user_activity_idx
  on public.notifications (user_id, last_activity_at desc);

-- data for a cheers group with one more cheer folded in: distinct givers (first
-- 10 ids and names), how many distinct givers, and a count per cheer type.
create or replace function public.cheers_group_data(p_data jsonb, p_giver uuid, p_name text, p_type text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'event_id', p_data->'event_id',
    'deep_link', p_data->'deep_link',
    'givers', case
      when coalesce(p_data->'givers', '[]'::jsonb) @> jsonb_build_array(p_giver) then coalesce(p_data->'givers', '[]'::jsonb)
      when jsonb_array_length(coalesce(p_data->'givers', '[]'::jsonb)) >= 10 then p_data->'givers'
      else coalesce(p_data->'givers', '[]'::jsonb) || jsonb_build_array(p_giver) end,
    'giver_names', case
      when coalesce(p_data->'givers', '[]'::jsonb) @> jsonb_build_array(p_giver) then coalesce(p_data->'giver_names', '[]'::jsonb)
      when jsonb_array_length(coalesce(p_data->'givers', '[]'::jsonb)) >= 10 then p_data->'giver_names'
      else coalesce(p_data->'giver_names', '[]'::jsonb) || jsonb_build_array(p_name) end,
    'giver_count', coalesce((p_data->>'giver_count')::int, 0)
      + case when coalesce(p_data->'givers', '[]'::jsonb) @> jsonb_build_array(p_giver) then 0 else 1 end,
    'cheer_counts', coalesce(p_data->'cheer_counts', '{}'::jsonb)
      || jsonb_build_object(p_type, coalesce((p_data->'cheer_counts'->>p_type)::int, 0) + 1)
  )
$$;

-- "rileyk, sam.ortiz and 2 others cheered you · Pass ×2, Spike"
create or replace function public.cheers_group_body(p_data jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  with names as (
    select coalesce(array_agg(x.name order by x.ord), array[]::text[]) as list
    from jsonb_array_elements_text(coalesce(p_data->'giver_names', '[]'::jsonb)) with ordinality as x(name, ord)
  ), total as (
    select greatest(coalesce((p_data->>'giver_count')::int, 0), cardinality((select list from names))) as n
  ), types as (
    select string_agg(initcap(replace(k, '_', ' ')) || case when v::int > 1 then ' ×' || v else '' end, ', ' order by v::int desc, k) as list
    from jsonb_each_text(coalesce(p_data->'cheer_counts', '{}'::jsonb)) as t(k, v)
  )
  select
    case
      when (select n from total) <= 1 then coalesce((select list[1] from names), 'Someone')
      when (select n from total) = 2 then (select list[1] || ' and ' || coalesce(list[2], 'someone') from names)
      when (select n from total) = 3 and cardinality((select list from names)) >= 3 then (select list[1] || ', ' || list[2] || ' and ' || list[3] from names)
      else (select list[1] || ', ' || coalesce(list[2], 'someone') from names) || ' and ' || ((select n from total) - 2) || ' others'
    end
    || ' cheered you'
    || coalesce(' · ' || (select list from types), '')
$$;

revoke all on function public.cheers_group_data(jsonb, uuid, text, text) from public, anon, authenticated;
revoke all on function public.cheers_group_body(jsonb) from public, anon, authenticated;

create or replace function public.notify_on_kudo_received()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  declare
    giver_username text;
    evt_title text;
    v_data jsonb;
  begin
    if NEW.receiver_id = NEW.giver_id then
      return NEW;
    end if;

    if not public.notification_pref_enabled(NEW.receiver_id, 'in_app', 'cheers_received') then
      return NEW;
    end if;

    select p.username into giver_username from public.profiles p where p.id = NEW.giver_id;
    select e.title into evt_title from public.events e where e.id = NEW.event_id;
    evt_title := coalesce(left(evt_title, 80), 'your game');

    v_data := public.cheers_group_data(
      jsonb_build_object('event_id', NEW.event_id, 'deep_link', '/event/' || NEW.event_id::text),
      NEW.giver_id, coalesce(giver_username, 'Someone'), NEW.cheer_type::text);

    insert into public.notifications as n
      (user_id, notification_type, title, body, data, group_key, group_count, last_activity_at)
    values (
      NEW.receiver_id,
      'cheers_received',
      'You got cheers from ' || evt_title,
      public.cheers_group_body(v_data),
      v_data,
      'cheers:' || NEW.event_id::text,
      1,
      now()
    )
    on conflict (user_id, group_key) where read_at is null and group_key is not null
    do update set
      group_count = n.group_count + 1,
      last_activity_at = now(),
      title = (n.group_count + 1)::text || ' cheers from ' || evt_title,
      data = public.cheers_group_data(n.data, NEW.giver_id, coalesce(giver_username, 'Someone'), NEW.cheer_type::text),
      body = public.cheers_group_body(public.cheers_group_data(n.data, NEW.giver_id, coalesce(giver_username, 'Someone'), NEW.cheer_type::text));

    return NEW;
  end;
$function$;

create or replace function public.notify_on_event_material_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  became_cancelled boolean;
  material_else boolean;
  notif_type text;
  notif_title text;
  notif_body text;
  changed jsonb := '[]'::jsonb;
begin
  became_cancelled := NEW.cancelled_at is not null and OLD.cancelled_at is null;

  if OLD.title is distinct from NEW.title then changed := changed || '["title"]'; end if;
  if OLD.event_date is distinct from NEW.event_date then changed := changed || '["time"]'; end if;
  if OLD.location is distinct from NEW.location then changed := changed || '["location"]'; end if;
  if OLD.max_attendees is distinct from NEW.max_attendees then changed := changed || '["spots"]'; end if;
  if OLD.duration_minutes is distinct from NEW.duration_minutes then changed := changed || '["length"]'; end if;
  material_else := jsonb_array_length(changed) > 0;

  if became_cancelled then
    notif_type := 'event_cancelled';
    notif_title := coalesce(NEW.title, 'Event') || ' cancelled';
    notif_body := 'This event was cancelled by the host.';

    insert into public.notifications (user_id, notification_type, title, body, data)
    select ea.user_id, notif_type, notif_title, notif_body,
           jsonb_build_object('event_id', NEW.id, 'deep_link', '/event/' || NEW.id::text)
    from public.event_attendees ea
    where ea.event_id = NEW.id
      and ea.status = 'attending'
      and ea.user_id is distinct from auth.uid()
      and public.notification_pref_enabled(ea.user_id, 'in_app', notif_type);
    return NEW;
  elsif not material_else then
    return NEW;
  end if;

  notif_type := 'event_material_change';
  notif_title := coalesce(NEW.title, 'Event') || ' changed';

  insert into public.notifications as n
    (user_id, notification_type, title, body, data, group_key, group_count, last_activity_at)
  select
    ea.user_id,
    notif_type,
    notif_title,
    'Changed: ' || (select string_agg(x, ', ') from jsonb_array_elements_text(changed) as x) || '. Open the event to see what''s new.',
    jsonb_build_object('event_id', NEW.id, 'deep_link', '/event/' || NEW.id::text, 'changed', changed),
    'event_change:' || NEW.id::text,
    1,
    now()
  from public.event_attendees ea
  where ea.event_id = NEW.id
    and ea.status = 'attending'
    and ea.user_id is distinct from auth.uid()
    and public.notification_pref_enabled(ea.user_id, 'in_app', notif_type)
  on conflict (user_id, group_key) where read_at is null and group_key is not null
  do update set
    group_count = n.group_count + 1,
    last_activity_at = now(),
    title = excluded.title,
    data = n.data || jsonb_build_object('changed',
      (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
         from jsonb_array_elements_text(coalesce(n.data->'changed', '[]'::jsonb) || (excluded.data->'changed')) as x)),
    body = 'Changed: ' ||
      (select string_agg(distinct x, ', ')
         from jsonb_array_elements_text(coalesce(n.data->'changed', '[]'::jsonb) || (excluded.data->'changed')) as x)
      || ' (' || (n.group_count + 1)::text || ' updates). Open the event to see what''s new.';

  return NEW;
end;
$function$;
