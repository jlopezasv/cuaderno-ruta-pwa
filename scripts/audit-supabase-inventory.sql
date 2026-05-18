-- =============================================================================
-- Inventario esquema Supabase (REAL o DEMO)
--
-- Uso:
--   1. Supabase Dashboard → SQL Editor → proyecto REAL → ejecutar → copiar JSON
--   2. Repetir en proyecto DEMO
--   3. Guardar como inventory/real.json e inventory/demo.json
--   4. node scripts/compare-supabase-inventory.mjs inventory/real.json inventory/demo.json
--
-- O con psql:
--   psql "$SUPABASE_DB_URL_REAL" -t -A -c "SELECT inventory FROM (...)" > inventory/real.json
-- =============================================================================

WITH
tables_list AS (
  SELECT coalesce(
    json_agg(t.table_name ORDER BY t.table_name),
    '[]'::json
  ) AS j
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
),
columns_list AS (
  SELECT coalesce(
    json_agg(
      json_build_object(
        'table', c.table_name,
        'column', c.column_name,
        'udt', c.udt_name,
        'data_type', c.data_type,
        'nullable', (c.is_nullable = 'YES'),
        'default', c.column_default
      )
      ORDER BY c.table_name, c.ordinal_position
    ),
    '[]'::json
  ) AS j
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
),
buckets_list AS (
  SELECT coalesce(
    json_agg(
      json_build_object(
        'name', b.name,
        'public', b.public,
        'file_size_limit', b.file_size_limit,
        'allowed_mime_types', b.allowed_mime_types
      )
      ORDER BY b.name
    ),
    '[]'::json
  ) AS j
  FROM storage.buckets b
),
policies_list AS (
  SELECT coalesce(
    json_agg(
      json_build_object(
        'schema', p.schemaname,
        'table', p.tablename,
        'name', p.policyname,
        'cmd', p.cmd,
        'roles', p.roles,
        'permissive', p.permissive,
        'qual', p.qual,
        'with_check', p.with_check
      )
      ORDER BY p.schemaname, p.tablename, p.policyname
    ),
    '[]'::json
  ) AS j
  FROM pg_policies p
  WHERE p.schemaname IN ('public', 'storage')
),
triggers_list AS (
  SELECT coalesce(
    json_agg(
      json_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'name', t.tgname,
        'timing', CASE
          WHEN t.tgtype::integer & 2 = 2 THEN 'BEFORE'
          ELSE 'AFTER'
        END,
        'events', trim(both ' ' FROM concat_ws(
          ' ',
          CASE WHEN t.tgtype::integer & 4 = 4 THEN 'INSERT' END,
          CASE WHEN t.tgtype::integer & 8 = 8 THEN 'DELETE' END,
          CASE WHEN t.tgtype::integer & 16 = 16 THEN 'UPDATE' END
        )),
        'function', pn.nspname || '.' || p.proname
      )
      ORDER BY n.nspname, c.relname, t.tgname
    ),
    '[]'::json
  ) AS j
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace pn ON pn.oid = p.pronamespace
  WHERE NOT t.tgisinternal
    AND n.nspname IN ('public', 'storage')
),
functions_list AS (
  SELECT coalesce(
    json_agg(
      json_build_object(
        'schema', n.nspname,
        'name', p.proname,
        'args', pg_get_function_identity_arguments(p.oid),
        'returns', pg_get_function_result(p.oid),
        'security_definer', p.prosecdef
      )
      ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    ),
    '[]'::json
  ) AS j
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
)
SELECT json_build_object(
  'schema_version', 1,
  'database', current_database(),
  'exported_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'tables', (SELECT j FROM tables_list),
  'columns', (SELECT j FROM columns_list),
  'buckets', (SELECT j FROM buckets_list),
  'policies', (SELECT j FROM policies_list),
  'triggers', (SELECT j FROM triggers_list),
  'functions', (SELECT j FROM functions_list)
) AS inventory;
