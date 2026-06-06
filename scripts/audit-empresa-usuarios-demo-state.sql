-- =============================================================================
-- FASE 0 — Auditoría estado multiusuario oficina (SOLO Supabase DEMO)
-- Ejecutar en SQL Editor del proyecto DEMO (ref fezacjtbavgdosncxlzw).
-- No modifica nada. Solo lectura.
-- =============================================================================

-- 1) Tablas base + intento anterior
SELECT table_name,
       (SELECT count(*) FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'empresas', 'profiles', 'servicios', 'conductor_empresa',
    'empresa_usuarios', 'usuarios_empresa'
  )
ORDER BY table_name;

-- 2) Columnas objetivo en cualquier tabla
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'servicios' AND column_name = 'responsable_user_id')
    OR (table_name = 'empresa_usuarios' AND column_name IN (
      'id', 'empresa_id', 'user_id', 'nombre', 'email', 'rol',
      'puede_ver_todos', 'activo', 'created_at'
    ))
    OR column_name IN ('rol', 'puede_ver_todos')
  )
ORDER BY table_name, ordinal_position;

-- 3) Índices relacionados
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    tablename IN ('empresa_usuarios', 'servicios')
    OR indexname LIKE '%empresa_usuarios%'
    OR indexname LIKE '%responsable%'
  )
ORDER BY tablename, indexname;

-- 4) Funciones del intento anterior / nueva
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END AS security
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'user_can_manage_empresa_usuarios',
    'get_current_office_user_context'
  )
ORDER BY p.proname;

-- 5) Policies RLS relacionadas
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    tablename IN ('empresa_usuarios', 'empresas', 'servicios')
    AND (
      policyname LIKE 'eu_%'
      OR policyname = 'emp_sel_oficina_demo'
      OR policyname LIKE 'srv_%'
    )
  )
ORDER BY tablename, policyname;

-- 6) RLS habilitada
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('empresa_usuarios', 'empresas', 'servicios')
ORDER BY c.relname;

-- 7) Conteos (datos)
SELECT 'empresa_usuarios' AS tabla, count(*) AS filas FROM public.empresa_usuarios
UNION ALL
SELECT 'empresas', count(*) FROM public.empresas
UNION ALL
SELECT 'servicios_con_responsable', count(*)
FROM public.servicios WHERE responsable_user_id IS NOT NULL;

-- Si empresa_usuarios no existe, la query 7 fallará → confirma que no hay tabla.

-- 8) Owners sin fila jefe_flota (si tabla existe)
SELECT e.id AS empresa_id, e.nombre, e.owner_id,
       eu.id AS eu_id, eu.rol, eu.activo
FROM public.empresas e
LEFT JOIN public.empresa_usuarios eu
  ON eu.empresa_id = e.id AND eu.user_id = e.owner_id
ORDER BY e.created_at;
