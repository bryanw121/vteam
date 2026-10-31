-- #98: record which Terms a new account agreed to, and when.
--
-- Sign-up is passive clickwrap: the agreement line sits under every way to
-- create an account (email sign-up, Continue with Google). Email sign-up sends
-- the version it showed in the auth metadata (`terms_version`); Google sign-in
-- can't carry metadata, so the trigger falls back to the version current when
-- this migration ran. Bump that fallback together with TERMS_VERSION in
-- constants/legal.ts. Existing accounts stay null (nothing was recorded).
--
-- Expand-only: two nullable columns and a replaced trigger function that keeps
-- the old behavior (profile row with the username) and adds the two values.

alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, terms_accepted_at, terms_version)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))),
    now(),
    coalesce(nullif(left(new.raw_user_meta_data->>'terms_version', 32), ''), '2026-10-27')
  );
  return new;
end;
$$;
-- Keep EXECUTE narrowed as 20261028160000_definer_search_path set it (a trigger
-- function: no client calls it). create or replace keeps the ACL; this makes it explicit.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
