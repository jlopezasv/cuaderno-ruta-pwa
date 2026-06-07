-- =============================================================================
-- AUDITORÍA join conductor → empresas por código (SOLO Supabase DEMO fezacjtbavgdosncxlzw)
-- Pegar en SQL Editor. NO ejecutar en producción (glyexutcypmhkndvmcxd).
-- =============================================================================

-- 1) Proyecto (comprobar ref en Dashboard → Settings → General)
SELECT current_database() AS db, current_user AS db_user;

-- 2) Empresa y código (service_role / postgres ve todo; ignora RLS)
SELECT
  id,
  nombre,
  codigo_equipo,
  codigo_corto,
  owner_id,
  length(trim(codigo_equipo)) AS len_equipo,
  codigo_equipo = 'DEMO-7562' AS eq_exacto,
  upper(trim(codigo_equipo)) = 'DEMO-7562' AS eq_upper
FROM public.empresas
WHERE codigo_equipo ILIKE '%7562%'
   OR codigo_corto ILIKE '%7562%'
   OR codigo_equipo = 'DEMO-7562';

-- 3) Policies empresas — buscar RESTRICTIVE (bloquean aunque exista conductor_lee_empresa)
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'empresas'
ORDER BY policyname;

-- 4) RLS y grants
SELECT
  c.relname,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'empresas';

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'empresas'
  AND grantee IN ('authenticated', 'anon', 'service_role')
ORDER BY grantee, privilege_type;

-- 5) conductor_lee_empresa existe y es PERMISSIVE
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'empresas'
        AND policyname = 'conductor_lee_empresa'
        AND cmd = 'SELECT'
        AND permissive = 'PERMISSIVE'
    ) THEN 'OK conductor_lee_empresa PERMISSIVE SELECT'
    WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'empresas'
        AND policyname = 'conductor_lee_empresa'
    ) THEN 'REVISAR: conductor_lee_empresa existe pero no es PERMISSIVE SELECT'
    ELSE 'FALTA conductor_lee_empresa'
  END AS veredicto_policy;

-- 6) Si emp_sel es RESTRICTIVE → explica HTTP 200 + [] con JWT válido
SELECT
  policyname,
  permissive,
  'Si RESTRICTIVE: bloquea conductores aunque conductor_lee_empresa exista' AS nota
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'empresas'
  AND cmd = 'SELECT'
  AND permissive = 'RESTRICTIVE';
