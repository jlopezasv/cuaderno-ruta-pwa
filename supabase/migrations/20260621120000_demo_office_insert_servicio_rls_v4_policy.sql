-- =============================================================================
-- DEMO v4: política INSERT directa oficina + recrear todas las policies servicios
-- Proyecto DEMO fezacjtbavgdosncxlzw — idempotente. NO aplicar en REAL.
--
-- Si user_can_insert_servicio devuelve true en RPC pero POST sigue 42501, suele
-- haber políticas INSERT legacy duplicadas o la policy no usa la función nueva.
-- =============================================================================

-- Política dedicada: oficina crea servicio planificado (conductor_id NULL).
-- Subconsulta empresa_usuarios visible al propio usuario (eu_sel: user_id = auth.uid()).
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
BEGIN
  IF auth.uid() IS NULL OR p_empresa_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  IF NOT EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.rol IN ('jefe_flota', 'trafico')
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
  'DEMO: oficina activa (jefe_flota/tráfico) inserta servicio sin conductor.';

REVOKE ALL ON FUNCTION public.office_user_can_insert_planned_servicio(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_user_can_insert_planned_servicio(uuid, uuid) TO authenticated, service_role;

-- Recrear TODAS las políticas servicios (elimina legacy owner-only u otras INSERT)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'servicios'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.servicios', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "srv_sel" ON public.servicios
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(id));

CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_insert_servicio(empresa_id, conductor_id)
    OR public.office_user_can_insert_planned_servicio(empresa_id, conductor_id)
  );

CREATE POLICY "srv_upd" ON public.servicios
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(id))
  WITH CHECK (public.user_can_access_servicio(id));

CREATE POLICY "srv_del" ON public.servicios
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(id));

GRANT INSERT, SELECT, UPDATE, DELETE ON public.servicios TO authenticated;

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
  v_insert_policies jsonb;
BEGIN
  v_uid := auth.uid();

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
    'user_can_access_empresa', public.user_can_access_empresa(p_empresa_id),
    'user_is_active_office_peer', public.user_is_active_office_peer(p_empresa_id),
    'user_can_insert_servicio', public.user_can_insert_servicio(p_empresa_id, p_conductor_id),
    'office_user_can_insert_planned_servicio',
      public.office_user_can_insert_planned_servicio(p_empresa_id, p_conductor_id),
    'insert_policies', v_insert_policies,
    'empresa_usuarios_self', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
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

REVOKE ALL ON FUNCTION public.debug_servicio_insert_rls_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_servicio_insert_rls_context(uuid, uuid) TO authenticated;

SELECT policyname, cmd, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'servicios'
ORDER BY policyname;
