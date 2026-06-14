-- =============================================================================
-- DEMO: fix user_can_manage_dcdt_trafico — STABLE + SET LOCAL no permitido (0A000)
-- Recrear como SQL VOLATILE sin SET dentro de la función.
-- Solo owner o jefe_flota/trafico activos (sin administrativo).
-- =============================================================================

DROP FUNCTION IF EXISTS public.user_can_manage_dcdt_trafico(uuid);

CREATE OR REPLACE FUNCTION public.user_can_manage_dcdt_trafico(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.empresas e
    WHERE e.id = p_empresa_id
      AND e.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.rol IN ('jefe_flota', 'trafico')
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) TO authenticated;
