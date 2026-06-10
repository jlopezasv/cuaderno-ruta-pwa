-- =============================================================================
-- DEMO v3: fix 0A000 "SET is not allowed in a non-volatile function"
-- Las funciones con SET LOCAL row_security deben ser VOLATILE, no STABLE.
-- Aplicar en DEMO (fezacjtbavgdosncxlzw) tras v2.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_can_access_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SET LOCAL row_security = off;

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

CREATE OR REPLACE FUNCTION public.user_is_active_conductor_of_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_empresa_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.conductor_empresa ce
    WHERE ce.empresa_id = p_empresa_id
      AND ce.user_id = auth.uid()
      AND (ce.activo IS DISTINCT FROM false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_profile_is_autonomo_pro()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT pr.tipo_cuenta
  INTO v_tipo
  FROM public.profiles pr
  WHERE pr.id = auth.uid()
  LIMIT 1;
  RETURN COALESCE(v_tipo IN ('autonomo_pro', 'autonomo'), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(
  p_empresa_id uuid,
  p_conductor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_is_autonomo boolean;
BEGIN
  v_uid := auth.uid();
  v_is_autonomo := public.user_profile_is_autonomo_pro();

  IF v_uid IS NOT NULL
     AND p_empresa_id IS NULL
     AND p_conductor_id IS NOT NULL
     AND p_conductor_id = v_uid
     AND v_is_autonomo
  THEN
    RETURN true;
  END IF;

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

  IF p_empresa_id IS NOT NULL
     AND p_conductor_id IS NULL
     AND v_uid IS NOT NULL
     AND to_regclass('public.empresa_usuarios') IS NOT NULL
  THEN
    SET LOCAL row_security = off;
    IF EXISTS (
      SELECT 1
      FROM public.empresa_usuarios eu
      WHERE eu.empresa_id = p_empresa_id
        AND eu.user_id = v_uid
        AND eu.activo = true
        AND eu.rol IN ('jefe_flota', 'trafico')
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_uid IS NOT NULL
     AND p_empresa_id IS NOT NULL
     AND p_conductor_id IS NOT NULL
     AND p_conductor_id = v_uid
     AND public.user_is_active_conductor_of_empresa(p_empresa_id)
  THEN
    RETURN true;
  END IF;

  IF p_empresa_id IS NOT NULL
     AND p_conductor_id IS NOT NULL
  THEN
    SET LOCAL row_security = off;
    IF EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      INNER JOIN public.empresas e ON e.id = ce.empresa_id
      WHERE ce.user_id = p_conductor_id
        AND ce.empresa_id = p_empresa_id
        AND (ce.activo IS DISTINCT FROM false)
        AND e.owner_id IS NOT NULL
        AND e.owner_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_servicio(servicio_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF servicio_uuid IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT
    (
      s.empresa_id IS NULL
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
  INTO v_ok
  FROM public.servicios s
  WHERE s.id = servicio_uuid;
  RETURN COALESCE(v_ok, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.user_is_active_office_peer(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.empresa_id = p_empresa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_profile_is_autonomo_pro() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_active_office_peer(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_profile_is_autonomo_pro() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_active_office_peer(uuid) TO authenticated, service_role;

-- Debe devolver volatile para todas
SELECT
  p.proname,
  CASE p.provolatile
    WHEN 'v' THEN 'VOLATILE'
    WHEN 's' THEN 'STABLE'
    WHEN 'i' THEN 'IMMUTABLE'
  END AS volatility
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'user_can_access_empresa',
    'user_can_insert_servicio',
    'user_can_access_servicio',
    'user_is_active_office_peer'
  )
ORDER BY p.proname;
