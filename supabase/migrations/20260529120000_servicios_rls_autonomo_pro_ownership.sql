-- =============================================================================
-- RLS servicios — ownership Autónomo PRO + flota empresa (multi-tenant ready)
--
-- Autónomo PRO (servicio propio):
--   empresa_id IS NULL
--   conductor_id = auth.uid()
--   → INSERT / SELECT / UPDATE / DELETE del propio servicio
--
-- Flota empresa (sin abrir acceso global):
--   owner empresa, conductor asignado, vínculo conductor_empresa activo
--
-- NO usa USING (true). Todo vía funciones SECURITY DEFINER + auth.uid().
-- =============================================================================

-- ─── Ownership helpers (reutilizables; futuro RBAC / multi-tenant por empresa_id) ─

/** Servicio personal Autónomo PRO: sin tenant empresa, conductor = usuario actual. */
CREATE OR REPLACE FUNCTION public.servicio_is_autonomo_pro_owned(
  p_empresa_id uuid,
  p_conductor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_empresa_id IS NULL
    AND p_conductor_id IS NOT NULL
    AND p_conductor_id = auth.uid();
$$;

COMMENT ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) IS
  'True si el servicio es propiedad directa del conductor autónomo (empresa_id NULL, conductor_id = auth.uid()).';

/** Dueño de empresa (tenant) en el modelo actual (owner_id). */
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
  'True si auth.uid() es owner_id de la empresa (tenant).';

/** Conductor activo vinculado a una empresa (flota). */
CREATE OR REPLACE FUNCTION public.user_is_active_conductor_of_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_empresa_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      WHERE ce.empresa_id = p_empresa_id
        AND ce.user_id = auth.uid()
        AND (ce.activo IS DISTINCT FROM false)
    );
$$;

-- ─── SELECT / UPDATE / DELETE (fila existente por id) ───────────────────────

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
        public.servicio_is_autonomo_pro_owned(s.empresa_id, s.conductor_id)
        OR (s.conductor_id IS NOT NULL AND s.conductor_id = auth.uid())
        OR public.user_can_access_empresa(s.empresa_id)
        OR (
          s.empresa_id IS NOT NULL
          AND public.user_is_active_conductor_of_empresa(s.empresa_id)
        )
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
  'Acceso a servicio: autónomo PRO propio, conductor asignado, owner empresa, conductor de flota, o jefe del conductor.';

-- ─── INSERT (valores de la fila nueva) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(
  p_empresa_id uuid,
  p_conductor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- 1) Autónomo PRO: servicio propio sin empresa
    public.servicio_is_autonomo_pro_owned(p_empresa_id, p_conductor_id)
    -- 2) Owner empresa: planificar servicio de su tenant (conductor opcional)
    OR (
      public.user_can_access_empresa(p_empresa_id)
      AND (
        p_conductor_id IS NULL
        OR p_conductor_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          WHERE ce.empresa_id = p_empresa_id
            AND ce.user_id = p_conductor_id
            AND (ce.activo IS DISTINCT FROM false)
        )
      )
    )
    -- 3) Conductor de flota creando/asignándose en servicio de su empresa
    OR (
      auth.uid() IS NOT NULL
      AND p_empresa_id IS NOT NULL
      AND p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND public.user_is_active_conductor_of_empresa(p_empresa_id)
    )
    -- 4) Jefe asigna conductor de su flota al crear
    OR (
      p_conductor_id IS NOT NULL
      AND p_empresa_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.conductor_empresa ce
        INNER JOIN public.empresas e ON e.id = ce.empresa_id
        WHERE ce.user_id = p_conductor_id
          AND ce.empresa_id = p_empresa_id
          AND (ce.activo IS DISTINCT FROM false)
          AND e.owner_id IS NOT NULL
          AND e.owner_id = auth.uid()
      )
    );
$$;

COMMENT ON FUNCTION public.user_can_insert_servicio(uuid, uuid) IS
  'INSERT servicios: autónomo PRO (empresa_id null), flota empresa, o asignación por jefe.';

-- ─── Permisos de ejecución ───────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO service_role;

-- ─── Políticas únicas en servicios ───────────────────────────────────────────

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'servicios'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.servicios', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.servicios FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.servicios TO authenticated;
GRANT ALL ON TABLE public.servicios TO service_role;

CREATE POLICY "srv_sel" ON public.servicios
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(id));

CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_insert_servicio(empresa_id, conductor_id));

CREATE POLICY "srv_upd" ON public.servicios
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(id))
  WITH CHECK (public.user_can_access_servicio(id));

CREATE POLICY "srv_del" ON public.servicios
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(id));

-- ─── Validación manual (SQL Editor, sustituir UUID) ───────────────────────────
-- SELECT public.servicio_is_autonomo_pro_owned(NULL, 'TU-UUID'::uuid);
-- Nota: auth.uid() solo existe en peticiones JWT; en Editor como postgres será NULL.
