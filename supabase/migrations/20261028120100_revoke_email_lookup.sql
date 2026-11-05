-- #99 part 1: usernames no longer resolve to emails for anyone but the server.
--
-- get_email_by_username returned auth.users.email to anyone, signed in or not.
-- Username sign-in now goes through the login-with-username edge function,
-- which calls this function with the service role and returns only a session
-- or a generic "Incorrect username or password".
--
-- The function itself stays (the edge function uses it); only clients lose
-- EXECUTE. Installed native builds older than this change fall back to
-- "Username not found" for username sign-in; email, Google, Apple and email
-- code sign-in keep working. See the PR for why this is not deferred.
revoke execute on function public.get_email_by_username(text) from public, anon, authenticated;
grant execute on function public.get_email_by_username(text) to service_role;
