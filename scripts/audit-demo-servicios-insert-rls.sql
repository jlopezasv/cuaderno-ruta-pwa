-- =============================================================================
-- DEMO: auditoría INSERT servicios + oficina (solo lectura)
-- Ejecutar en SQL Editor DEMO (fezacjtbavgdosncxlzw).
-- Sustituir :uid y :empresa_id por valores reales.
-- =============================================================================

-- 1) Funciones clave (deben ser DEFINER + row_security off)
SELECT
  p.proname,
  CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  position('row_security' in pg_get_functiondef(p.oid)) > 0 AS row_security_off,
  position('empresa_usuarios' in pg_get_functiondef(p.oid)) > 0 AS menciona_empresa_usuarios
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'user_can_access_empresa',
    'user_can_insert_servicio',
    'user_can_access_servicio',
    'user_is_active_office_peer'
  )
ORDER BY p.proname;

-- 2) Políticas INSERT en servicios (debe haber solo srv_ins)
SELECT policyname, cmd, permissive, roles, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'servicios'
  AND cmd IN ('INSERT', 'ALL')
ORDER BY policyname;

-- 3) Usuario oficina (ejemplo del error)
SELECT eu.*, e.nombre AS empresa_nombre
FROM public.empresa_usuarios eu
JOIN public.empresas e ON e.id = eu.empresa_id
WHERE eu.user_id = '57e19f02-e5e8-4eae-b699-da2b9f06b7b9';

-- 4) Simular permiso INSERT (como postgres; auth.uid() será NULL aquí)
-- Para probar con JWT real: POST /rest/v1/rpc/debug_servicio_insert_rls_context
-- Body: {"p_empresa_id":"<uuid-empresa>","p_conductor_id":null}
