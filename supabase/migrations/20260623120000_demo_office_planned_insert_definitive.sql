-- =============================================================================
-- DEMO ONLY — office_user_can_insert_planned_servicio (definitivo)
-- Proyecto fezacjtbavgdosncxlzw. NO aplicar en REAL.
-- =============================================================================

-- 1) Auditar definición actual (opcional)
-- SELECT pg_get_functiondef(
--   'public.office_user_can_insert_planned_servicio(uuid,uuid)'::regprocedure
-- );

CREATE OR REPLACE FUNCTION public.office_user_can_insert_planned_servicio(
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
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL OR p_empresa_id IS NULL THEN
    RETURN false;
  END IF;

  SET LOCAL row_security = off;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = v_uid
      AND eu.activo IS TRUE
      AND lower(btrim(eu.rol)) IN ('jefe_flota', 'trafico')
  ) THEN
    RETURN false;
  END IF;

  IF p_conductor_id IS NULL THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.conductor_empresa ce
    WHERE ce.empresa_id = p_empresa_id
      AND ce.user_id = p_conductor_id
      AND (ce.activo IS DISTINCT FROM false)
  );
END;
$$;

COMMENT ON FUNCTION public.office_user_can_insert_planned_servicio(uuid, uuid) IS
  'DEMO: oficina activa (jefe_flota/tráfico) INSERT servicio; conductor_id NULL OK.';

REVOKE ALL ON FUNCTION public.office_user_can_insert_planned_servicio(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_user_can_insert_planned_servicio(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.debug_office_planned_insert(
  p_empresa_id uuid,
  p_conductor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_office_ok boolean;
  v_conductor_ok boolean;
BEGIN
  v_uid := auth.uid();
  SET LOCAL row_security = off;

  SELECT EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = v_uid
      AND eu.activo IS TRUE
      AND lower(btrim(eu.rol)) IN ('jefe_flota', 'trafico')
  ) INTO v_office_ok;

  IF p_conductor_id IS NULL THEN
    v_conductor_ok := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      WHERE ce.empresa_id = p_empresa_id
        AND ce.user_id = p_conductor_id
        AND (ce.activo IS DISTINCT FROM false)
    ) INTO v_conductor_ok;
  END IF;

  RETURN jsonb_build_object(
    'auth_uid', v_uid,
    'p_empresa_id', p_empresa_id,
    'p_conductor_id', p_conductor_id,
    'office_user_ok', v_office_ok,
    'conductor_ok', v_conductor_ok,
    'office_user_can_insert_planned_servicio',
      public.office_user_can_insert_planned_servicio(p_empresa_id, p_conductor_id),
    'empresa_usuarios_rows', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'empresa_id', eu.empresa_id,
        'rol', eu.rol,
        'activo', eu.activo
      )), '[]'::jsonb)
      FROM public.empresa_usuarios eu
      WHERE eu.user_id = v_uid
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.debug_office_planned_insert(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_office_planned_insert(uuid, uuid) TO authenticated;

SELECT
  p.proname,
  CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  CASE p.provolatile WHEN 'v' THEN 'VOLATILE' WHEN 's' THEN 'STABLE' ELSE p.provolatile::text END AS volatility,
  position('p_conductor_id IS NULL' in pg_get_functiondef(p.oid)) > 0 AS permite_conductor_null
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'office_user_can_insert_planned_servicio';
