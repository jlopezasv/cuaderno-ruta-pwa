-- =============================================================================
-- FIX: user_can_insert_servicio — rama Autónomo PRO explícita (tipo_cuenta + NULL empresa)
--
-- Ejecutar si srv_ins ya usa user_can_insert_servicio pero INSERT sigue en 42501.
-- No toca políticas (srv_sel/srv_ins/srv_upd/srv_del).
--
-- Autónomo PRO permitido cuando:
--   auth.uid() IS NOT NULL
--   empresa_id IS NULL
--   conductor_id = auth.uid()
--   profiles.tipo_cuenta IN ('autonomo_pro', 'autonomo')  -- legacy autonomo migrado
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_profile_is_autonomo_pro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND COALESCE(pr.tipo_cuenta, '') IN ('autonomo_pro', 'autonomo')
  );
$$;

COMMENT ON FUNCTION public.user_profile_is_autonomo_pro() IS
  'Perfil autónomo PRO (o legacy autonomo). Excluye conductor puro y empresa.';

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
    AND public.user_profile_is_autonomo_pro()
    AND p_empresa_id IS NULL
    AND p_conductor_id IS NOT NULL
    AND p_conductor_id = auth.uid();
$$;

COMMENT ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) IS
  'Ownership Autónomo PRO: sin empresa_id, conductor_id = auth.uid(), tipo_cuenta autónomo.';

-- ─── Función objetivo del diagnóstico ─────────────────────────────────────────

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
    ---------------------------------------------------------------------------
    -- (1) AUTÓNOMO PRO — NO exige empresa_id; NO es tipo_cuenta empresa
    ---------------------------------------------------------------------------
    (
      auth.uid() IS NOT NULL
      AND p_empresa_id IS NULL
      AND p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND public.user_profile_is_autonomo_pro()
    )
    ---------------------------------------------------------------------------
    -- (2) Owner empresa (tenant): empresa_id obligatorio
    ---------------------------------------------------------------------------
    OR (
      p_empresa_id IS NOT NULL
      AND public.user_can_access_empresa(p_empresa_id)
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
    ---------------------------------------------------------------------------
    -- (3) Conductor de flota en servicio de su empresa
    ---------------------------------------------------------------------------
    OR (
      auth.uid() IS NOT NULL
      AND p_empresa_id IS NOT NULL
      AND p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND public.user_is_active_conductor_of_empresa(p_empresa_id)
    )
    ---------------------------------------------------------------------------
    -- (4) Jefe asigna conductor de flota al crear
    ---------------------------------------------------------------------------
    OR (
      p_empresa_id IS NOT NULL
      AND p_conductor_id IS NOT NULL
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
  'INSERT: (1) autonomo_pro sin empresa_id; (2-4) flota empresa. Sin USING(true).';

-- SELECT/UPDATE alineados con ownership autónomo + perfil
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
        OR (
          s.conductor_id IS NOT NULL
          AND s.conductor_id = auth.uid()
        )
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

REVOKE ALL ON FUNCTION public.user_profile_is_autonomo_pro() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_profile_is_autonomo_pro() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated, service_role;

-- Ver definición activa tras aplicar:
-- SELECT pg_get_functiondef('public.user_can_insert_servicio(uuid,uuid)'::regprocedure);
