-- #11: server-side rate limits on abuse-prone writes and lookups.
--
-- Builds on the rate-limit core from #102 (20261028120200_rate_limit_core.sql:
-- public.rate_limits, check_rate_limit, enforce_rate_limit raising PT429 ->
-- HTTP 429). The triggers and RPCs below call enforce_rate_limit as their
-- (definer) owner. The login-with-username limits live in #102's function.
--
-- Thresholds (generous on purpose: e2e signs in and posts often):
--   login-with-username   100 / 15 min per IP, 30 / 15 min per username   (edge function)
--   find_or_create_dm      30 new conversations / hour per user           (existing DMs are free)
--   search_members        120 searches / minute per user
--   messages               60 / minute per user
--   event_comments         20 / minute per user
--   tournament_comments    20 / minute per user
--   club_posts             10 / minute per user
--   club_post_comments     20 / minute per user
--   feedback_submissions    5 / hour per user
-- Register and password reset go straight to Supabase Auth, whose own limits
-- apply (Dashboard > Authentication > Rate Limits); see CLAUDE.md.

-- BEFORE INSERT trigger: TG_ARGV = (bucket, max, window seconds), keyed per signed-in user.
-- Inserts without a user (service role, cron) are not limited.
create or replace function public.rate_limit_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null then
    perform public.enforce_rate_limit(tg_argv[0] || ':' || v_uid::text, tg_argv[1]::integer, tg_argv[2]::integer);
  end if;
  return new;
end;
$$;
revoke execute on function public.rate_limit_insert() from public, anon, authenticated;

drop trigger if exists trg_rate_limit_messages on public.messages;
create trigger trg_rate_limit_messages before insert on public.messages
  for each row execute function public.rate_limit_insert('message', '60', '60');

drop trigger if exists trg_rate_limit_event_comments on public.event_comments;
create trigger trg_rate_limit_event_comments before insert on public.event_comments
  for each row execute function public.rate_limit_insert('event_comment', '20', '60');

drop trigger if exists trg_rate_limit_tournament_comments on public.tournament_comments;
create trigger trg_rate_limit_tournament_comments before insert on public.tournament_comments
  for each row execute function public.rate_limit_insert('tournament_comment', '20', '60');

drop trigger if exists trg_rate_limit_club_posts on public.club_posts;
create trigger trg_rate_limit_club_posts before insert on public.club_posts
  for each row execute function public.rate_limit_insert('club_post', '10', '60');

drop trigger if exists trg_rate_limit_club_post_comments on public.club_post_comments;
create trigger trg_rate_limit_club_post_comments before insert on public.club_post_comments
  for each row execute function public.rate_limit_insert('club_post_comment', '20', '60');

drop trigger if exists trg_rate_limit_feedback on public.feedback_submissions;
create trigger trg_rate_limit_feedback before insert on public.feedback_submissions
  for each row execute function public.rate_limit_insert('feedback', '5', '3600');

-- DM creation: same behavior as before, plus a limit on NEW conversations only,
-- and a fixed search_path (it is SECURITY DEFINER).
create or replace function public.find_or_create_dm(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  conv_id uuid;
  me uuid := auth.uid();
begin
  select cm1.conversation_id into conv_id
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  join public.conversations c on c.id = cm1.conversation_id
  where cm1.user_id = me
    and cm2.user_id = other_user_id
    and c.type = 'dm'
  limit 1;

  if conv_id is null then
    if me is not null then
      perform public.enforce_rate_limit('dm_create:' || me::text, 30, 3600);
    end if;
    insert into public.conversations (type) values ('dm') returning id into conv_id;
    insert into public.conversation_members (conversation_id, user_id)
    values (conv_id, me), (conv_id, other_user_id);
  end if;

  return conv_id;
end;
$function$;

-- Member search for the "find a player" boxes (new DM, co-host, tournament
-- invite): substring match on username / first / last name, rate limited.
-- Signed-in users only (the boxes need an account).
create or replace function public.search_members(p_query text, p_limit integer default 10)
returns table (
  id uuid,
  username text,
  first_name text,
  last_name text,
  avatar_url text,
  selected_border text,
  "position" text[],
  skill_level text,
  created_at timestamp
)
language plpgsql
volatile -- it counts the search (PostgREST runs STABLE functions read-only)
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_term text := btrim(coalesce(p_query, ''));
  v_pattern text;
begin
  if v_uid is null or char_length(v_term) = 0 then
    return;
  end if;
  perform public.enforce_rate_limit('search:' || v_uid::text, 120, 60);
  v_pattern := '%' || replace(replace(replace(left(v_term, 64), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, p.username, p.first_name, p.last_name, p.avatar_url, p.selected_border, p."position", p.skill_level, p.created_at
    from public.profiles p
    where p.username ilike v_pattern or p.first_name ilike v_pattern or p.last_name ilike v_pattern
    order by p.username
    limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;
revoke execute on function public.search_members(text, integer) from public, anon;
grant execute on function public.search_members(text, integer) to authenticated;
