-- Undo 20261028160100_fix_cheers_reminder_type.sql: the original body (with
-- the 'kudos_reminder' type), keeping the search_path set by 20261028160000.
create or replace function public.send_kudos_reminders()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
DECLARE
  ev RECORD;
  attendee_id uuid;
BEGIN
  FOR ev IN
    SELECT e.id, e.title
    FROM events e
    WHERE e.cancelled_at IS NULL
      AND (e.event_date + (COALESCE(e.duration_minutes, 120) * INTERVAL '1 minute'))
          BETWEEN NOW() - INTERVAL '15 minutes' AND NOW()
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.notification_type = 'kudos_reminder'
          AND (n.data->>'event_id') = e.id::text
        LIMIT 1
      )
  LOOP
    FOR attendee_id IN
      SELECT ea.user_id
      FROM event_attendees ea
      WHERE ea.event_id = ev.id
        AND ea.status = 'attending'
    LOOP
      INSERT INTO notifications (user_id, notification_type, title, body, data)
      VALUES (
        attendee_id,
        'kudos_reminder',
        'Time to give cheers! 🏐',
        'The event "' || ev.title || '" just ended. Give cheers to your fellow players!',
        jsonb_build_object(
          'event_id', ev.id::text,
          'deep_link', '/event/' || ev.id::text || '?tab=3'
        )
      );
    END LOOP;
  END LOOP;
END;
$function$;
