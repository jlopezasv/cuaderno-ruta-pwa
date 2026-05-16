-- =============================================================================
-- REPARACIÓN: funciones RLS de servicios (INSERT bloqueado / SQL manual roto)
--
-- Vuelve a definir user_can_access_empresa, user_can_access_servicio y
-- user_can_insert_servicio exactamente como en 20260521150000.
-- NO elimina políticas salvo srv_ins; sustituye funciones y recrea INSERT.
--
-- Ejecutar en Supabase SQL Editor si POST /servicios devuelve 403 o 42501.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_can_access_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_empresa_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.empresas e
      WHERE e.id = p_empresa_id
        AND e.owner_id IS NOT NULL
        AND e.owner_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.user_can_access_empresa(uuid) IS
  'True si auth.uid() es owner_id de la empresa.';

REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated;

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
  'Conductor del servicio; dueño empresa; o jefe del conductor asignado.';

REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(p_empresa_id uuid, p_conductor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      public.user_can_access_empresa(p_empresa_id)
      AND (
        p_conductor_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          WHERE ce.empresa_id = p_empresa_id
            AND ce.user_id = p_conductor_id
            AND (ce.activo IS DISTINCT FROM false)
        )
        OR p_conductor_id = auth.uid()
      )
    )
    OR (
      p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND (
        p_empresa_id IS NULL
        OR public.user_can_access_empresa(p_empresa_id)
      )
    )
    OR (
      p_conductor_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.conductor_empresa ce
        INNER JOIN public.empresas e ON e.id = ce.empresa_id
        WHERE ce.user_id = p_conductor_id
          AND (ce.activo IS DISTINCT FROM false)
          AND e.owner_id IS NOT NULL
          AND e.owner_id = auth.uid()
          AND (p_empresa_id IS NULL OR ce.empresa_id = p_empresa_id)
      )
    );
$$;

COMMENT ON FUNCTION public.user_can_insert_servicio(uuid, uuid) IS
  'INSERT servicios: empresa sin conductor (NULL), con conductor de flota, o autónomo.';

REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated;

-- Política INSERT: re-crear por si quedó apuntando a otra función o corrupta
DROP POLICY IF EXISTS "srv_ins" ON public.servicios;
CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_insert_servicio(empresa_id, conductor_id));

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicios TO authenticated;
