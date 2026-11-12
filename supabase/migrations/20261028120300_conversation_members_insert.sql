-- #99 review: anyone signed in could add themselves to any conversation whose
-- id they knew ("Can insert self as member" only checked user_id = auth.uid()),
-- and then read its messages and chat images.
--
-- contract: no app version has ever inserted into conversation_members directly
-- (git history of app/, hooks/, components/, lib/); every join goes through a
-- SECURITY DEFINER function (find_or_create_dm, create_club_conversation,
-- auto_join_club_conversation), which RLS does not apply to.
drop policy if exists "Can insert self as member" on public.conversation_members;
