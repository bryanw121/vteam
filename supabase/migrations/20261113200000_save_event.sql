-- #188 part 4: one transaction for saving an event from the host form.
-- Create: one events row per date (1..52) and its tags. Edit: the row, the tag
-- diff, and waitlist promotion up to the new free spots. Any error leaves
-- nothing written. SECURITY INVOKER: every write goes through the existing RLS
-- (events by their creator, event_tags by the event's creator, attendee updates
-- by the host), so this adds no privilege.
create or replace function public.save_event(
  p_edit_id uuid,
  p_event jsonb,
  p_dates timestamptz[],
  p_tag_ids uuid[] default '{}'
) returns uuid[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  ids uuid[];
  r public.events;
  cap int;
  taken int;
  free int;
begin
  if auth.uid() is null then
    raise exception 'save_event: sign in first' using errcode = '42501';
  end if;
  if coalesce(array_length(p_dates, 1), 0) not between 1 and 52 then
    raise exception 'save_event: 1 to 52 dates' using errcode = '22023';
  end if;
  if p_edit_id is not null and array_length(p_dates, 1) <> 1 then
    raise exception 'save_event: an edit has one date' using errcode = '22023';
  end if;

  r := jsonb_populate_record(null::public.events, p_event);
  if coalesce(btrim(r.title), '') = '' then
    raise exception 'save_event: title required' using errcode = '22023';
  end if;
  if r.price is not null and r.price < 0 then
    raise exception 'save_event: price must not be negative' using errcode = '22023';
  end if;
  if r.max_attendees is not null and r.max_attendees < 1 then
    raise exception 'save_event: max players must be at least 1' using errcode = '22023';
  end if;

  if p_edit_id is null then
    with inserted as (
      insert into public.events (
        title, description, location, latitude, longitude, event_date, duration_minutes,
        max_attendees, created_by, club_id, price, venmo_handle, requires_approval, surface
      )
      select r.title, r.description, r.location, r.latitude, r.longitude, d, coalesce(r.duration_minutes, 120),
             r.max_attendees, auth.uid(), r.club_id, r.price, r.venmo_handle, coalesce(r.requires_approval, false), r.surface
      from unnest(p_dates) with ordinality as t(d, n)
      order by n
      returning id, event_date
    )
    select array_agg(id order by event_date) into ids from inserted;
  else
    update public.events e set
      title = r.title,
      description = r.description,
      location = r.location,
      latitude = r.latitude,
      longitude = r.longitude,
      event_date = p_dates[1],
      duration_minutes = coalesce(r.duration_minutes, e.duration_minutes),
      max_attendees = r.max_attendees,
      club_id = r.club_id,
      price = r.price,
      venmo_handle = r.venmo_handle,
      requires_approval = coalesce(r.requires_approval, e.requires_approval),
      surface = r.surface
    where e.id = p_edit_id;  -- RLS: the creator only
    if not found then
      raise exception 'save_event: event not found or not yours' using errcode = '42501';
    end if;
    ids := array[p_edit_id];
  end if;

  -- Tags: drop the ones no longer picked, add the new ones.
  delete from public.event_tags
  where event_id = any(ids) and tag_id <> all(coalesce(p_tag_ids, '{}'));
  insert into public.event_tags (event_id, tag_id)
  select e, t from unnest(ids) e, unnest(coalesce(p_tag_ids, '{}')) t
  on conflict do nothing;

  -- Edit that opened spots: promote the oldest waitlisted players, under the
  -- same per-event lock joins take (enforce_event_capacity), so a player joining
  -- meanwhile can't push the game over its cap. notify_on_waitlist_promoted
  -- tells each of them, as before.
  if p_edit_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('event_capacity:' || p_edit_id::text, 0));
    cap := r.max_attendees;
    if cap is null then
      update public.event_attendees set status = 'attending'
      where event_id = p_edit_id and status = 'waitlisted';
    else
      select
        (select count(*) from public.event_attendees a where a.event_id = p_edit_id and a.status = 'attending')
      + (select count(*) from public.event_guests g where g.event_id = p_edit_id and g.status = 'attending')
      into taken;
      free := cap - taken;
      if free > 0 then
        update public.event_attendees a set status = 'attending'
        where a.event_id = p_edit_id and a.user_id in (
          select w.user_id from public.event_attendees w
          where w.event_id = p_edit_id and w.status = 'waitlisted'
          order by w.joined_at
          limit free
          for update skip locked
        );
      end if;
    end if;
  end if;

  return ids;
end;
$$;

revoke all on function public.save_event(uuid, jsonb, timestamptz[], uuid[]) from public, anon;
grant execute on function public.save_event(uuid, jsonb, timestamptz[], uuid[]) to authenticated;

comment on function public.save_event(uuid, jsonb, timestamptz[], uuid[]) is
  'Host form save (#188): create (one row per date, max 52) or edit (row, tag diff, waitlist promotion) in one transaction. Security invoker: RLS applies.';
