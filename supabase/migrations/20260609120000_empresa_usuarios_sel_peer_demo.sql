-- =============================================================================
-- DEMO: usuarios oficina pueden leer compañeros activos de la misma empresa
-- (necesario para desplegable Responsable del servicio).
-- Aplicar SOLO en Supabase DEMO.
-- =============================================================================

DROP POLICY IF EXISTS eu_sel_peer_demo ON public.empresa_usuarios;

CREATE POLICY eu_sel_peer_demo ON public.empresa_usuarios
  FOR SELECT TO authenticated
  USING (
    to_regclass('public.empresa_usuarios') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.empresa_usuarios yo
      WHERE yo.user_id = auth.uid()
        AND yo.activo = true
        AND yo.empresa_id = empresa_usuarios.empresa_id
    )
  );
