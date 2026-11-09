-- Undo 20261028130000_account_deletion.sql.
drop function if exists public.delete_account(uuid, text);
drop function if exists public.get_account_deletion_preview();
drop function if exists public.account_deletion_plan(uuid);
drop function if exists public.club_successor(uuid, uuid);
drop function if exists public.account_is_being_deleted(uuid);

-- Kudos from deleted accounts can't keep a null giver under the old NOT NULL.
delete from public.cheers where giver_id is null;
alter table public.cheers drop constraint if exists kudos_giver_id_fkey;
alter table public.cheers add constraint kudos_giver_id_fkey
  foreign key (giver_id) references public.profiles(id) on delete cascade;
alter table public.cheers alter column giver_id set not null;
