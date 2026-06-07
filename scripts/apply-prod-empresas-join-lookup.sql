-- REAL (glyexutcypmhkndvmcxd): SQL Editor — join conductor por código (RPC).
-- Idempotente. Igual que 20260615120000_empresas_conductor_codigo_lookup_prod.sql

DROP FUNCTION IF EXISTS public.lookup_empresa_por_codigo(text);

CREATE OR REPLACE FUNCTION public.lookup_empresa_por_codigo(p_codigo text)
RETURNS TABLE (
  id uuid,
  nombre text,
  codigo_equipo text,
  codigo_corto text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.nombre,
    e.codigo_equipo,
    e.codigo_corto
  FROM public.empresas e
  WHERE auth.uid() IS NOT NULL
    AND (
      upper(trim(coalesce(e.codigo_equipo, ''))) = upper(trim(coalesce(p_codigo, '')))
      OR upper(trim(coalesce(e.codigo_corto, ''))) = upper(trim(coalesce(p_codigo, '')))
    )
  LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.lookup_empresa_por_codigo(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lookup_empresa_por_codigo(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_empresa_por_codigo(text) TO authenticated;
