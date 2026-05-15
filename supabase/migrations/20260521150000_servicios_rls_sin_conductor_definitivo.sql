-- =============================================================================
-- Servicios SIN conductor (pendiente_asignacion) — RLS definitivo
--
-- Objetivo:
--   • Empresa (owner) crea servicio con conductor_id NULL
--   • Paradas, planificación, asignación posterior
--   • Sin romper: conductor asignado, tracking, documentos, panel conductor
--
-- Idempotente. Ejecutar en Supabase SQL Editor si 42501 en INSERT servicios.
-- Sustituye / complementa: 20260521140000_servicios_rls_pendiente_asignacion.sql
-- =============================================================================

-- 1) Esquema: conductor opcional
ALTER TABLE public.servicios
  ALTER COLUMN conductor_id DROP NOT NULL;

COMMENT ON COLUMN public.servicios.conductor_id IS
  'Conductor principal. NULL = pendiente de asignación (visible en empresa, no en app conductor).';

-- -----------------------------------------------------------------------------
-- 2) Helpers SECURITY DEFINER (auth.uid() dentro de la función)
-- -----------------------------------------------------------------------------

/** Propietario de la empresa (jefe de flota en el modelo actual). */
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
  'True si auth.uid() es owner_id de la empresa. Base para INSERT/SELECT servicios sin conductor.';

REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated;

/** Acceso a un servicio existente (SELECT/UPDATE/stops/evidencias). */
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
  'Conductor del servicio; o dueño empresa (conductor_id NULL permitido); o jefe del conductor asignado.';

REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;

/** INSERT en servicios — conductor_id opcional. */
CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(p_empresa_id uuid, p_conductor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- A) Jefe: servicio de su empresa (sin conductor o con conductor de su flota)
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
    -- B) Conductor autónomo (sin empresa o con su empresa)
    OR (
      p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND (
        p_empresa_id IS NULL
        OR public.user_can_access_empresa(p_empresa_id)
      )
    )
    -- C) Jefe asigna conductor de flota al crear (empresa_id puede venir en el row)
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
  'INSERT servicios: empresa sin conductor (NULL), con conductor de flota, o conductor autónomo.';

REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) Limpiar TODAS las políticas legacy en servicios (evita 42501 por política antigua)
-- -----------------------------------------------------------------------------
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

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicios TO authenticated;
GRANT ALL ON public.servicios TO service_role;

-- -----------------------------------------------------------------------------
-- 4) Políticas servicios (único conjunto activo)
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- 5) servicio_asignaciones (si la tabla existe; idempotente con 20260521120000)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'servicio_asignaciones'
  ) THEN
    ALTER TABLE public.servicio_asignaciones ENABLE ROW LEVEL SECURITY;

    GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicio_asignaciones TO authenticated;
    GRANT ALL ON public.servicio_asignaciones TO service_role;

    EXECUTE 'DROP POLICY IF EXISTS "sa_sel" ON public.servicio_asignaciones';
    EXECUTE 'DROP POLICY IF EXISTS "sa_ins" ON public.servicio_asignaciones';
    EXECUTE 'DROP POLICY IF EXISTS "sa_upd" ON public.servicio_asignaciones';
    EXECUTE 'DROP POLICY IF EXISTS "sa_del" ON public.servicio_asignaciones';

    EXECUTE $p$
      CREATE POLICY "sa_sel" ON public.servicio_asignaciones
        FOR SELECT TO authenticated
        USING (public.user_can_access_servicio(servicio_id))
    $p$;
    EXECUTE $p$
      CREATE POLICY "sa_ins" ON public.servicio_asignaciones
        FOR INSERT TO authenticated
        WITH CHECK (public.user_can_access_servicio(servicio_id))
    $p$;
    EXECUTE $p$
      CREATE POLICY "sa_upd" ON public.servicio_asignaciones
        FOR UPDATE TO authenticated
        USING (public.user_can_access_servicio(servicio_id))
        WITH CHECK (public.user_can_access_servicio(servicio_id))
    $p$;
    EXECUTE $p$
      CREATE POLICY "sa_del" ON public.servicio_asignaciones
        FOR DELETE TO authenticated
        USING (public.user_can_access_servicio(servicio_id))
    $p$;
  END IF;
END;
$$;
