-- schema_pending_changes(): schema changes applied to beta for open PRs, so the
-- drift check (scripts/schema-drift.mjs) can allow exactly those differences.
--
-- The ledger itself (beta_meta.pending_changes, plus beta_meta.apply_pr_migration /
-- rollback_pr / complete_pr) exists only on beta, outside the public schema, so
-- it is not part of the schema fingerprint. This function is identical on both
-- projects: on live (no ledger) it returns [].
--
-- Returns [{ pr, migration, keys: [fingerprint keys], applied_at }]. No SQL text
-- leaves the database. Apply to BOTH projects. Idempotent.
create or replace function public.schema_pending_changes()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  r jsonb;
begin
  if to_regclass('beta_meta.pending_changes') is null then
    return '[]'::jsonb;
  end if;
  execute 'select coalesce(jsonb_agg(jsonb_build_object(''pr'', pr, ''migration'', migration, ''keys'', keys, ''applied_at'', applied_at) order by applied_at, id), ''[]''::jsonb) from beta_meta.pending_changes'
    into r;
  return r;
end $$;

revoke all on function public.schema_pending_changes() from public;
grant execute on function public.schema_pending_changes() to anon, authenticated, service_role;
