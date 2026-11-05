-- Undo 20261028120100_revoke_email_lookup.sql: restore the original grants.
grant execute on function public.get_email_by_username(text) to public, anon, authenticated, service_role;
