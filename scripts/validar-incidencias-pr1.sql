-- Verificación post PR-1 (Supabase DEMO)
-- Ejecutar en SQL Editor tras 20260526120000_incidencias_operativas.sql

SELECT 'incidencias_table' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'incidencias'
  ) AS ok;

SELECT 'evidencias_incidencia_id' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evidencias' AND column_name = 'incidencia_id'
  ) AS ok;

SELECT 'vista_resumen' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_servicio_incidencias_resumen'
  ) AS ok;

SELECT 'rls_incidencias' AS check_name,
  c.relrowsecurity AS ok
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'incidencias';

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'incidencias'
ORDER BY policyname;
