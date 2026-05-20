-- Permite a conductores activos de la empresa crear/ver paradas en servicios de esa empresa
-- (servicio aún sin conductor_id o planificado por flota).
-- Idempotente. Ejecutar en Supabase SQL Editor si falla INSERT en stops con 403.

CREATE OR REPLACE FUNCTION public.user_can_access_servicio(servicio_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        (s.conductor_id IS NOT NULL AND s.conductor_id = auth.uid())
        OR public.user_can_access_empresa(s.empresa_id)
        OR (
          s.empresa_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.conductor_empresa ce
            WHERE ce.empresa_id = s.empresa_id
              AND ce.user_id = auth.uid()
              AND (ce.activo IS DISTINCT FROM false)
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          INNER JOIN public.empresas e ON e.id = ce.empresa_id
          WHERE s.conductor_id IS NOT NULL
            AND ce.user_id = s.conductor_id
            AND (ce.activo IS DISTINCT FROM false)
            AND e.owner_id IS NOT NULL
            AND e.owner_id = auth.uid()
        )
      FROM public.servicios s
      WHERE s.id = servicio_uuid
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.user_can_access_servicio(uuid) IS
  'Conductor del servicio; dueño empresa; conductor activo de la empresa del servicio; o jefe del conductor asignado.';

REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;
