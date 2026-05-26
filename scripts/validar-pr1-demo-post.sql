-- Ejecutar DESPUES de sql-pr1-incidencias-demo-FINAL.sql (solo lectura)

SELECT 'tabla_incidencias' AS check_name,
  to_regclass('public.incidencias') IS NOT NULL AS ok;

SELECT 'columna_evidencias_incidencia_id' AS check_name,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'evidencias'
      AND column_name = 'incidencia_id'
  ) AS ok;

SELECT 'vista_resumen' AS check_name,
  to_regclass('public.v_servicio_incidencias_resumen') IS NOT NULL AS ok;

SELECT 'funcion_incidencias_set_updated_at' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'incidencias_set_updated_at'
  ) AS ok;

SELECT 'funcion_incidencias_validate_servicio_stop' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'incidencias_validate_servicio_stop'
  ) AS ok;

SELECT 'funcion_evidencias_validate_incidencia_adjunto' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'evidencias_validate_incidencia_adjunto'
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

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'evidencias'
  AND policyname IN ('ev_sel', 'ev_ins', 'ev_upd', 'ev_del')
ORDER BY policyname;

SELECT COUNT(*)::int AS incidencias_count FROM public.incidencias;

SELECT COUNT(*)::int AS vista_resumen_rows FROM public.v_servicio_incidencias_resumen;
