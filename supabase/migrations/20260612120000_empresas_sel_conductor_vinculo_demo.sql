-- =============================================================================
-- DEMO: conductores autenticados pueden leer empresas para vincular por código.
-- Sin esto, GET empresas?codigo_equipo=eq."..." devuelve [] (solo emp_sel owner).
-- Aplicar SOLO en Supabase DEMO.
-- =============================================================================

DROP POLICY IF EXISTS conductor_lee_empresa ON public.empresas;

CREATE POLICY conductor_lee_empresa ON public.empresas
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

COMMENT ON POLICY conductor_lee_empresa ON public.empresas IS
  'DEMO: lookup codigo_equipo / preview join team (authenticated).';
