-- =============================================================================
-- DEMO: RLS servicios/documentos para usuarios de oficina (empresa_usuarios)
-- Aplicar SOLO en Supabase DEMO (fezacjtbavgdosncxlzw).
-- Idempotente. No tocar producción.
--
-- Problema: user_can_access_empresa solo contemplaba owner_id → administrativo/
-- tráfico no podían SELECT servicios (expedientes vacíos en UI).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_can_access_empresa(p_empresa_id uuid)
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

  IF EXISTS (
    SELECT 1
    FROM public.empresas e
    WHERE e.id = p_empresa_id
      AND e.owner_id IS NOT NULL
      AND e.owner_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  IF to_regclass('public.empresa_usuarios') IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.empresa_usuarios eu
      WHERE eu.empresa_id = p_empresa_id
        AND eu.user_id = auth.uid()
        AND eu.activo = true
    );
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.user_can_access_empresa(uuid) IS
  'Owner de empresa o usuario oficina activo (empresa_usuarios). DEMO: rama oficina solo si existe la tabla.';

REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated, service_role;

-- Lectura de conductores de la flota para filtros en Documentos (nombres/matrículas)
DROP POLICY IF EXISTS ce_sel_oficina_demo ON public.conductor_empresa;

CREATE POLICY ce_sel_oficina_demo ON public.conductor_empresa
  FOR SELECT TO authenticated
  USING (
    to_regclass('public.empresa_usuarios') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.empresa_usuarios eu
      WHERE eu.empresa_id = conductor_empresa.empresa_id
        AND eu.user_id = auth.uid()
        AND eu.activo = true
    )
  );

-- Verificación rápida (debe devolver DEFINER y mencionar empresa_usuarios en prosrc)
SELECT
  p.proname,
  CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  position('empresa_usuarios' in pg_get_functiondef(p.oid)) > 0 AS incluye_oficina
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'user_can_access_empresa';
