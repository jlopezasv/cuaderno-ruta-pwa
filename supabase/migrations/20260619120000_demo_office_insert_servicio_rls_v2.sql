-- =============================================================================
-- DEMO v2: INSERT servicios usuarios oficina — row_security off en empresa_usuarios
-- Proyecto DEMO fezacjtbavgdosncxlzw — idempotente. NO aplicar en REAL.
--
-- v1 (20260618120000) podía seguir devolviendo false si RLS en empresa_usuarios
-- bloqueaba la lectura dentro de user_can_access_empresa (sin row_security off).
-- Mismo patrón que user_is_active_office_peer / user_can_manage_empresa_usuarios.
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

COMMENT ON FUNCTION public.user_can_access_empresa(uuid) IS
  'Owner o usuario oficina activo. DEMO v2: row_security off al leer empresa_usuarios.';

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

COMMENT ON FUNCTION public.user_can_insert_servicio(uuid, uuid) IS
  'INSERT servicios. DEMO v2: row_security off + oficina sin conductor.';

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

-- Eliminar TODAS las políticas INSERT legacy (no solo srv_ins)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'servicios'
      AND cmd IN ('INSERT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.servicios', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_insert_servicio(empresa_id, conductor_id));

-- Diagnóstico desde el navegador (JWT real)
CREATE OR REPLACE FUNCTION public.debug_servicio_insert_rls_context(
  p_empresa_id uuid DEFAULT NULL,
  p_conductor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_conductor uuid;
  v_office jsonb;
  v_insert_policies jsonb;
BEGIN
  v_uid := auth.uid();
  v_conductor := COALESCE(p_conductor_id, NULL);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'empresa_id', eu.empresa_id,
        'rol', eu.rol,
        'activo', eu.activo,
        'puede_ver_todos', eu.puede_ver_todos
      )
    ),
    '[]'::jsonb
  )
  INTO v_office
  FROM public.empresa_usuarios eu
  WHERE eu.user_id = v_uid;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', p.policyname,
        'cmd', p.cmd,
        'permissive', p.permissive,
        'with_check', p.with_check
      )
      ORDER BY p.policyname
    ),
    '[]'::jsonb
  )
  INTO v_insert_policies
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'servicios'
    AND p.cmd IN ('INSERT', 'ALL');

  RETURN jsonb_build_object(
    'ts', now(),
    'auth_uid', v_uid,
    'params', jsonb_build_object(
      'p_empresa_id', p_empresa_id,
      'p_conductor_id', p_conductor_id
    ),
    'empresa_usuarios_visible_invoker', v_office,
    'user_can_access_empresa', public.user_can_access_empresa(p_empresa_id),
    'user_is_active_office_peer',
      CASE
        WHEN to_regprocedure('public.user_is_active_office_peer(uuid)') IS NOT NULL
        THEN public.user_is_active_office_peer(p_empresa_id)
        ELSE NULL
      END,
    'user_can_insert_servicio', public.user_can_insert_servicio(p_empresa_id, v_conductor),
    'insert_policies', v_insert_policies,
    'hint',
      'Si user_can_insert_servicio=true pero POST falla con return=representation, revisar srv_sel.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.debug_servicio_insert_rls_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_servicio_insert_rls_context(uuid, uuid) TO authenticated;

-- Verificación (debe mostrar incluye_oficina=true y row_security en prosrc)
SELECT
  p.proname,
  CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  position('row_security' in pg_get_functiondef(p.oid)) > 0 AS tiene_row_security_off
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('user_can_access_empresa', 'user_can_insert_servicio')
ORDER BY p.proname;
