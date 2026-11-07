-- Undo 20261107210000_notification_groups.sql: the two trigger functions as
-- they were, then the helpers, indexes and columns.

create or replace function public.notify_on_kudo_received()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  DECLARE
    giver_username text;
    evt_title text;
  BEGIN
    IF NEW.receiver_id = NEW.giver_id THEN
      RETURN NEW;
    END IF;

    IF NOT public.notification_pref_enabled(NEW.receiver_id, 'in_app', 'cheers_received') THEN
      RETURN NEW;
    END IF;

    SELECT p.username INTO giver_username FROM public.profiles p WHERE p.id = NEW.giver_id;
    SELECT e.title INTO evt_title FROM public.events e WHERE e.id = NEW.event_id;

    INSERT INTO public.notifications (user_id, notification_type, title, body, data)
    VALUES (
      NEW.receiver_id,
      'cheers_received',
      'You received cheers',
      COALESCE(giver_username, 'Someone') || ' gave you ' || REPLACE(NEW.cheer_type::text, '_', ' ') || ' cheers'
        || CASE WHEN evt_title IS NOT NULL THEN ' · ' || LEFT(evt_title, 80) ELSE '' END,
      jsonb_build_object(
        'event_id', NEW.event_id,
        'cheer_id', NEW.id,
        'deep_link', '/event/' || NEW.event_id::text
      )
    );

    RETURN NEW;
  END;
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
begin
  became_cancelled := NEW.cancelled_at is not null and OLD.cancelled_at is null;

  material_else :=
       OLD.title is distinct from NEW.title
    or OLD.event_date is distinct from NEW.event_date
    or OLD.location is distinct from NEW.location
    or OLD.max_attendees is distinct from NEW.max_attendees
    or OLD.duration_minutes is distinct from NEW.duration_minutes;

  if became_cancelled then
    notif_type := 'event_cancelled';
    notif_title := coalesce(NEW.title, 'Event') || ' cancelled';
    notif_body := 'This event was cancelled by the host.';
  elsif material_else then
    notif_type := 'event_material_change';
    notif_title := coalesce(NEW.title, 'Event') || ' updated';
    notif_body := 'Details changed — open the event to see what''s new.';
  else
    return NEW;
  end if;

  insert into public.notifications (user_id, notification_type, title, body, data)
  select
    ea.user_id,
    notif_type,
    notif_title,
    notif_body,
    jsonb_build_object(
      'event_id', NEW.id,
      'deep_link', '/event/' || NEW.id::text
    )
  from public.event_attendees ea
  where ea.event_id = NEW.id
    and ea.status = 'attending'
    and ea.user_id is distinct from auth.uid()
    and public.notification_pref_enabled(ea.user_id, 'in_app', notif_type);

  return NEW;
end;
$function$;

drop function if exists public.cheers_group_body(jsonb);
drop function if exists public.cheers_group_data(jsonb, uuid, text, text);
drop index if exists public.notifications_user_activity_idx;
drop index if exists public.notifications_open_group_uidx;
alter table public.notifications
  drop column if exists last_activity_at,
  drop column if exists group_count,
  drop column if exists group_key;
