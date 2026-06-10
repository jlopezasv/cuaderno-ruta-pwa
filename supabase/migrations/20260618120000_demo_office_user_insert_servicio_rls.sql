-- =============================================================================
-- DEMO: INSERT servicios para usuarios oficina (jefe_flota / tráfico) sin conductor
-- Proyecto DEMO fezacjtbavgdosncxlzw — idempotente. NO aplicar en REAL.
--
-- Síntoma: 42501 al crear servicio planificado (conductor_id NULL) como usuario
-- oficina que no es owner_id de empresas.
-- =============================================================================

-- Acceso tenant: owner O usuario oficina activo
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
  'Owner de empresa o usuario oficina activo (empresa_usuarios). DEMO multiusuario.';

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

CREATE OR REPLACE FUNCTION public.user_profile_is_autonomo_pro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT pr.tipo_cuenta IN ('autonomo_pro', 'autonomo')
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(
  p_empresa_id uuid,
  p_conductor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_is_autonomo boolean;
BEGIN
  v_uid := auth.uid();
  v_is_autonomo := public.user_profile_is_autonomo_pro();

  -- (1) Autónomo PRO: servicio propio sin empresa_id
  IF v_uid IS NOT NULL
     AND p_empresa_id IS NULL
     AND p_conductor_id IS NOT NULL
     AND p_conductor_id = v_uid
     AND v_is_autonomo
  THEN
    RETURN true;
  END IF;

  -- (2) Owner o oficina con acceso al tenant (conductor opcional / NULL)
  IF p_empresa_id IS NOT NULL
     AND public.user_can_access_empresa(p_empresa_id)
     AND (
       p_conductor_id IS NULL
       OR p_conductor_id = v_uid
       OR EXISTS (
         SELECT 1
         FROM public.conductor_empresa ce
         WHERE ce.empresa_id = p_empresa_id
           AND ce.user_id = p_conductor_id
           AND (ce.activo IS DISTINCT FROM false)
       )
     )
  THEN
    RETURN true;
  END IF;

  -- (2b) Oficina jefe_flota / tráfico: crear sin conductor (planificado)
  IF p_empresa_id IS NOT NULL
     AND p_conductor_id IS NULL
     AND v_uid IS NOT NULL
     AND to_regclass('public.empresa_usuarios') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.empresa_usuarios eu
       WHERE eu.empresa_id = p_empresa_id
         AND eu.user_id = v_uid
         AND eu.activo = true
         AND eu.rol IN ('jefe_flota', 'trafico')
     )
  THEN
    RETURN true;
  END IF;

  -- (3) Conductor de flota: asignado a sí mismo
  IF v_uid IS NOT NULL
     AND p_empresa_id IS NOT NULL
     AND p_conductor_id IS NOT NULL
     AND p_conductor_id = v_uid
     AND public.user_is_active_conductor_of_empresa(p_empresa_id)
  THEN
    RETURN true;
  END IF;

  -- (4) Owner asigna conductor de flota al crear
  IF p_empresa_id IS NOT NULL
     AND p_conductor_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.conductor_empresa ce
       INNER JOIN public.empresas e ON e.id = ce.empresa_id
       WHERE ce.user_id = p_conductor_id
         AND ce.empresa_id = p_empresa_id
         AND (ce.activo IS DISTINCT FROM false)
         AND e.owner_id IS NOT NULL
         AND e.owner_id = v_uid
     )
  THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.user_can_insert_servicio(uuid, uuid) IS
  'INSERT servicios. DEMO: owner, oficina (jefe_flota/tráfico) sin conductor, autónomo PRO, flota.';

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
        (
          auth.uid() IS NOT NULL
          AND s.empresa_id IS NULL
          AND s.conductor_id IS NOT NULL
          AND s.conductor_id = auth.uid()
          AND public.user_profile_is_autonomo_pro()
        )
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

REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_profile_is_autonomo_pro() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_profile_is_autonomo_pro() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "srv_ins" ON public.servicios;

CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_insert_servicio(empresa_id, conductor_id));
