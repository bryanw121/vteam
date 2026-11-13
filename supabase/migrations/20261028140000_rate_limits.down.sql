-- Undo 20261028140000_rate_limits.sql.
drop function if exists public.search_members(text, integer);

-- find_or_create_dm exactly as it was.
create or replace function public.find_or_create_dm(other_user_id uuid)
 returns uuid
 language plpgsql
 security definer
as $function$
DECLARE
  conv_id UUID;
  me UUID := auth.uid();
BEGIN
  -- Find existing DM between the two users
  SELECT cm1.conversation_id INTO conv_id
  FROM conversation_members cm1
  JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
  JOIN conversations c ON c.id = cm1.conversation_id
  WHERE cm1.user_id = me
    AND cm2.user_id = other_user_id
    AND c.type = 'dm'
  LIMIT 1;

  IF conv_id IS NULL THEN
    INSERT INTO conversations (type) VALUES ('dm') RETURNING id INTO conv_id;
    INSERT INTO conversation_members (conversation_id, user_id)
    VALUES (conv_id, me), (conv_id, other_user_id);
  END IF;

  RETURN conv_id;
END;
$function$;
alter function public.find_or_create_dm(uuid) reset search_path;

drop trigger if exists trg_rate_limit_messages on public.messages;
drop trigger if exists trg_rate_limit_event_comments on public.event_comments;
drop trigger if exists trg_rate_limit_tournament_comments on public.tournament_comments;
drop trigger if exists trg_rate_limit_club_posts on public.club_posts;
drop trigger if exists trg_rate_limit_club_post_comments on public.club_post_comments;
drop trigger if exists trg_rate_limit_feedback on public.feedback_submissions;
drop function if exists public.rate_limit_insert();
