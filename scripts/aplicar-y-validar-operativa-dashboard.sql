-- =============================================================================
-- Aplicar RLS flota + validación (Supabase → SQL Editor, rol postgres)
-- Idempotente: puedes ejecutarlo más de una vez.
-- =============================================================================

-- A) Migración: jefe lee ubicaciones de conductores de su flota
DROP POLICY IF EXISTS "ubi_sel_empresa_flota" ON public.ubicaciones;

CREATE POLICY "ubi_sel_empresa_flota" ON public.ubicaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      INNER JOIN public.empresas e ON e.id = ce.empresa_id AND e.owner_id = auth.uid()
      WHERE ce.user_id = ubicaciones.user_id
        AND (ce.activo IS DISTINCT FROM false)
    )
  );

-- B) Validación: política creada
SELECT
  pol.polname AS policy_name,
  pol.polcmd AS cmd
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'public'
  AND cls.relname = 'ubicaciones'
  AND pol.polname = 'ubi_sel_empresa_flota';

-- C) Políticas SELECT en ubicaciones
SELECT pol.polname
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE nsp.nspname = 'public'
  AND cls.relname = 'ubicaciones'
  AND pol.polcmd = 'r'
ORDER BY 1;

-- D) Últimas ubicaciones (contexto operativo)
SELECT
  u.user_id,
  u.empresa_id,
  u.servicio_id,
  u.event_type,
  u.ts
FROM public.ubicaciones u
ORDER BY u.ts DESC NULLS LAST
LIMIT 15;

-- E) Conductores activos por empresa
SELECT ce.empresa_id, ce.user_id, ce.activo
FROM public.conductor_empresa ce
WHERE ce.activo IS DISTINCT FROM false
ORDER BY ce.updated_at DESC NULLS LAST
LIMIT 20;

-- F) Servicios activos con ETA en referencia
SELECT
  s.id,
  s.conductor_id,
  s.empresa_id,
  s.estado,
  (s.referencia->'operational_eta' IS NOT NULL) AS tiene_operational_eta
FROM public.servicios s
WHERE s.estado IN ('asignado', 'en_curso')
ORDER BY s.updated_at DESC NULLS LAST
LIMIT 15;
