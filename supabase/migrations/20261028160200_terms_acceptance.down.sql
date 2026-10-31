-- Undo 20261028160200_terms_acceptance.sql: restore handle_new_user as
-- 20261028160000_definer_search_path left it (original body, search_path
-- public, pg_temp; EXECUTE stays revoked: create or replace keeps the ACL),
-- then drop the columns.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))));
  return new;
end;
$function$;
alter table public.profiles drop column if exists terms_version;
alter table public.profiles drop column if exists terms_accepted_at;
