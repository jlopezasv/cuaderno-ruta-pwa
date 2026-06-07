-- =============================================================================
-- DEMO: fix join equipo — conductor_lee_empresa como PRODUCCIÓN + emp_sel PERMISSIVE
-- Si emp_sel quedó RESTRICTIVE, conductor_lee_empresa no basta (HTTP 200 + []).
-- Aplicar SOLO en Supabase DEMO (fezacjtbavgdosncxlzw).
-- =============================================================================

-- Igual que producción (schema.sql): sin TO authenticated, PERMISSIVE
DROP POLICY IF EXISTS conductor_lee_empresa ON public.empresas;

CREATE POLICY conductor_lee_empresa ON public.empresas
  AS PERMISSIVE
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

COMMENT ON POLICY conductor_lee_empresa ON public.empresas IS
  'DEMO: lookup codigo_equipo — paridad prod (authenticated JWT, auth.uid() NOT NULL).';

-- emp_sel debe ser PERMISSIVE (no RESTRICTIVE)
DROP POLICY IF EXISTS emp_sel ON public.empresas;

CREATE POLICY emp_sel ON public.empresas
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

GRANT SELECT ON public.empresas TO authenticated;
