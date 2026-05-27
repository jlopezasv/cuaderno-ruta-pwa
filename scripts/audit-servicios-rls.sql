-- Auditoría RLS servicios (SQL Editor como postgres / service_role)
-- Ejecutar en el MISMO proyecto Supabase que usa la demo (VITE_SUPABASE_URL).

-- 1) Policies INSERT activas
SELECT
  policyname,
  roles,
  cmd,
  permissive,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'servicios'
ORDER BY cmd, policyname;

-- 2) RLS y grants
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'servicios';

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'servicios'
ORDER BY grantee, privilege_type;

-- 3) Perfil del usuario (sustituir UUID)
-- SELECT id, tipo_cuenta, can_drive FROM public.profiles
-- WHERE id = '9fce8a2a-f3c2-43c1-910e-9d50fdaf8cad';

-- 4) Definición de user_can_insert_servicio (debe incluir rama autonomo_pro)
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'user_can_insert_servicio'
ORDER BY p.oid DESC
LIMIT 1;
