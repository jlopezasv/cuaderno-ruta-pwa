-- DEMO: asegurar codigo_equipo en todas las empresas + exponerlo en RPC de sesión oficina.
-- Campo canónico: empresas.codigo_equipo (trigger empresas_bi_codigo_equipo_fn).
-- NO aplica a producción salvo que se ejecute manualmente en otro proyecto.

-- 1) Re-ejecutar backfill (idempotente) si falta migración 20260518140000
DO $$
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RAISE NOTICE 'empresas: omitido backfill codigo_equipo';
    RETURN;
  END IF;
  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS codigo_equipo text;
END $$;

-- Dispara trigger BEFORE UPDATE para filas sin código
UPDATE public.empresas e
SET nombre = e.nombre
WHERE codigo_equipo IS NULL OR btrim(codigo_equipo) = '';

-- 2) Política SELECT oficina (si no existe por drift DEMO)
DROP POLICY IF EXISTS emp_sel_oficina_demo ON public.empresas;

CREATE POLICY emp_sel_oficina_demo ON public.empresas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.empresa_usuarios eu
      WHERE eu.empresa_id = empresas.id
        AND eu.user_id = auth.uid()
        AND eu.activo = true
    )
  );

-- 3) RPC sesión: incluir codigo_equipo (SECURITY DEFINER, no depende de RLS directa)
DROP FUNCTION IF EXISTS public.get_current_office_user_context();

CREATE OR REPLACE FUNCTION public.get_current_office_user_context()
RETURNS TABLE (
  user_id uuid,
  email text,
  nombre text,
  empresa_id uuid,
  empresa_nombre text,
  codigo_equipo text,
  rol text,
  puede_ver_todos boolean,
  activo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    eu.user_id,
    eu.email,
    eu.nombre,
    eu.empresa_id,
    e.nombre AS empresa_nombre,
    e.codigo_equipo,
    eu.rol,
    eu.puede_ver_todos,
    eu.activo
  FROM public.empresa_usuarios eu
  INNER JOIN public.empresas e ON e.id = eu.empresa_id
  WHERE eu.user_id = auth.uid()
    AND eu.activo = true
  ORDER BY eu.created_at
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_current_office_user_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_office_user_context() TO authenticated;

COMMENT ON FUNCTION public.get_current_office_user_context() IS
  'DEMO: contexto usuario oficina + codigo_equipo de su empresa (sin depender de servicios/conductores).';
