-- schema_fingerprint(): a hash per schema object, so CI can prove the live and
-- beta projects have the same schema (scripts/schema-drift.mjs compares them).
--
-- Returns {"<kind>:<name>": "<md5>", ...} covering public tables/columns,
-- constraints, indexes, views, functions, triggers (incl. on auth.users), RLS
-- flags, policies (public + storage), table/column/function grants, the
-- realtime publication, enums, extensions (names only), storage buckets,
-- pg_cron jobs, and the rows of the reference tables (tags, major_cities,
-- app_config). Only hashes and object names leave the database (the schema is
-- public in the repo anyway), so anon may call it.
--
-- Apply to BOTH projects. Idempotent.
create or replace function public.schema_fingerprint()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with items(k, v) as (
    -- columns
    select 'column:' || c.table_name || '.' || c.column_name,
           md5(concat_ws('|', c.data_type, c.udt_name, c.is_nullable, c.column_default, c.is_identity, c.identity_generation, c.is_generated, c.generation_expression, c.character_maximum_length::text))
    from information_schema.columns c
    where c.table_schema = 'public'
    union all
    -- tables, RLS flags, table grants
    select 'table:' || cl.relname,
           md5(concat_ws('|', cl.relkind::text, cl.relrowsecurity::text, cl.relforcerowsecurity::text, cl.relreplident::text, array_to_string(cl.reloptions, ','),
                         (select string_agg(a::text, ',' order by a::text) from unnest(coalesce(cl.relacl, '{}'::aclitem[])) a)))
    from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and cl.relkind in ('r', 'p', 'v', 'm', 'S')
    union all
    -- column grants
    select 'colgrant:' || cl.relname || '.' || a.attname,
           md5((select string_agg(x::text, ',' order by x::text) from unnest(a.attacl) x))
    from pg_attribute a join pg_class cl on cl.oid = a.attrelid join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and a.attacl is not null and a.attnum > 0 and not a.attisdropped
    union all
    -- constraints
    select 'constraint:' || cl.relname || '.' || co.conname, md5(pg_get_constraintdef(co.oid))
    from pg_constraint co join pg_class cl on cl.oid = co.conrelid join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public'
    union all
    -- indexes
    select 'index:' || i.indexname, md5(i.indexdef)
    from pg_indexes i where i.schemaname = 'public'
    union all
    -- views
    select 'view:' || v.viewname, md5(v.definition)
    from pg_views v where v.schemaname = 'public'
    union all
    -- functions (definition + execute grants)
    select 'function:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
           md5(pg_get_functiondef(p.oid) || '|' || coalesce((select string_agg(a::text, ',' order by a::text) from unnest(p.proacl) a), ''))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
    union all
    -- triggers on public tables and on auth.users
    select 'trigger:' || n.nspname || '.' || cl.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_class cl on cl.oid = t.tgrelid join pg_namespace n on n.oid = cl.relnamespace
    where not t.tgisinternal and (n.nspname = 'public' or (n.nspname = 'auth' and cl.relname = 'users'))
    union all
    -- policies
    select 'policy:' || p.schemaname || '.' || p.tablename || '.' || p.policyname,
           md5(concat_ws('|', p.permissive, array_to_string(p.roles, ','), p.cmd, p.qual, p.with_check))
    from pg_policies p where p.schemaname in ('public', 'storage')
    union all
    -- realtime publication
    select 'publication:' || pt.pubname || '.' || pt.schemaname || '.' || pt.tablename, md5('1')
    from pg_publication_tables pt where pt.pubname = 'supabase_realtime'
    union all
    -- enums
    select 'enum:' || t.typname, md5((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'
    union all
    -- extensions (names only: versions differ by Postgres minor)
    select 'extension:' || e.extname, md5('1') from pg_extension e
    union all
    -- storage buckets
    select 'bucket:' || b.id, md5(concat_ws('|', b.public::text, b.file_size_limit::text, array_to_string(b.allowed_mime_types, ',')))
    from storage.buckets b
    union all
    -- pg_cron jobs
    select 'cron:' || j.jobname, md5(concat_ws('|', j.schedule, j.command, j.active::text))
    from cron.job j
    union all
    -- reference data
    select 'rows:tags', md5(coalesce((select string_agg(to_jsonb(t)::text, ',' order by t.id::text) from public.tags t), ''))
    union all
    select 'rows:major_cities', md5(coalesce((select string_agg(to_jsonb(m)::text, ',' order by m.id::text) from public.major_cities m), ''))
    union all
    select 'rows:app_config', md5(coalesce((select string_agg(to_jsonb(a)::text, ',' order by a.platform::text) from public.app_config a), ''))
  )
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from items where k is not null;
$$;

comment on function public.schema_fingerprint() is
  'md5 per schema object (tables, columns, constraints, indexes, views, functions, triggers, policies, grants, publication, buckets, cron, reference rows). CI compares live vs beta (scripts/schema-drift.mjs).';

revoke all on function public.schema_fingerprint() from public;
grant execute on function public.schema_fingerprint() to anon, authenticated, service_role;
