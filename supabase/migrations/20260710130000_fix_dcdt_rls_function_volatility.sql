-- =============================================================================
-- Fix user_can_manage_dcdt_trafico — STABLE + SET LOCAL no permitido (0A000)
-- CREATE OR REPLACE (sin DROP): las políticas RLS siguen enlazadas a la función.
-- Misma lógica; solo VOLATILE y sin SET LOCAL dentro del cuerpo.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_can_manage_dcdt_trafico(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
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
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) TO authenticated;
