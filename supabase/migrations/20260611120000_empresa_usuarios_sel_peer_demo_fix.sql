-- =============================================================================
-- DEMO FIX: eu_sel_peer_demo causaba recursión RLS → HTTP 500 en GET empresa_usuarios.
-- La subconsulta directa a empresa_usuarios dentro de la policy re-dispara RLS.
-- Solución: función SECURITY DEFINER con row_security off (mismo patrón que
-- user_can_manage_empresa_usuarios).
-- Aplicar SOLO en Supabase DEMO.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_is_active_office_peer(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.empresa_id = p_empresa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_is_active_office_peer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_active_office_peer(uuid) TO authenticated;

COMMENT ON FUNCTION public.user_is_active_office_peer(uuid) IS
  'DEMO: usuario oficina activo de la empresa (sin recursión RLS).';

DROP POLICY IF EXISTS eu_sel_peer_demo ON public.empresa_usuarios;

CREATE POLICY eu_sel_peer_demo ON public.empresa_usuarios
  FOR SELECT TO authenticated
  USING (public.user_is_active_office_peer(empresa_id));
