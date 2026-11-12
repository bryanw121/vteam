-- #223: usernames stay fixed once chosen. The profiles update policy limits
-- rows, not columns, so a client could rename itself through the API. This
-- rejects a username change made by a client role; sign-up is an INSERT (not
-- covered), and an admin can still rename someone in SQL (a non-client role).
-- No app code writes username after sign-up, so this is expand-safe.
create or replace function public.profiles_guard_username()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.username is distinct from old.username and current_user in ('authenticated', 'anon') then
    raise exception 'Usernames can''t be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_username
  before update of username on public.profiles
  for each row execute function public.profiles_guard_username();
