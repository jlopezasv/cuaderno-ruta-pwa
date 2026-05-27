-- =============================================================================
-- DEFINITIVO: user_can_insert_servicio + helpers (Autónomo PRO, sin policies)
--
-- Ejecutar en Supabase SQL Editor si srv_ins OK pero INSERT sigue 42501.
-- Incluye TODAS las dependencias en un solo script.
--
-- Rama (1) Autónomo PRO — condiciones explícitas:
--   auth.uid() IS NOT NULL
--   p_empresa_id IS NULL          (sin tenant empresa)
--   p_conductor_id = auth.uid()   (ownership fila)
--   profiles.tipo_cuenta IN ('autonomo_pro','autonomo')  — NO empresa/conductor
--
-- NO usa USING(true). NO exige empresa_id NOT NULL para autónomo.
-- =============================================================================

-- ─── Helper: dueño de empresa (tenant) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_can_access_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_empresa_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.empresas e
      WHERE e.id = p_empresa_id
        AND e.owner_id IS NOT NULL
        AND e.owner_id = auth.uid()
    );
$$;

-- ─── Helper: conductor activo en flota ───────────────────────────────────────
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

-- ─── Helper: perfil Autónomo PRO (tipo explícito, no legacy empresa-only) ───
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

COMMENT ON FUNCTION public.user_profile_is_autonomo_pro() IS
  'True si profiles.tipo_cuenta es autonomo_pro o autonomo (legacy). False si conductor/empresa/sin fila.';

-- ─── FUNCIÓN PRINCIPAL: INSERT ─────────────────────────────────────────────────
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

  -- (1) AUTÓNOMO PRO: servicio propio, sin empresa_id
  IF v_uid IS NOT NULL
     AND p_empresa_id IS NULL
     AND p_conductor_id IS NOT NULL
     AND p_conductor_id = v_uid
     AND v_is_autonomo
  THEN
    RETURN true;
  END IF;

  -- (2) Owner empresa: servicio del tenant (conductor opcional)
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

  -- (3) Conductor de flota: servicio de su empresa, asignado a sí mismo
  IF v_uid IS NOT NULL
     AND p_empresa_id IS NOT NULL
     AND p_conductor_id IS NOT NULL
     AND p_conductor_id = v_uid
     AND public.user_is_active_conductor_of_empresa(p_empresa_id)
  THEN
    RETURN true;
  END IF;

  -- (4) Jefe asigna conductor de flota al crear
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
  'INSERT servicios. Rama 1: autonomo_pro + empresa_id NULL + conductor_id=auth.uid(). Ramas 2-4: flota.';

-- ─── SELECT / UPDATE (acceso a fila existente) ───────────────────────────────
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

-- ─── Permisos ────────────────────────────────────────────────────────────────
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
