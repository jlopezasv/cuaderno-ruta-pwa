-- =============================================================================
-- Autónomo PRO: reparación RLS INSERT en servicios (42501)
--
-- Síntoma: POST /servicios con empresa_id NULL y conductor_id = auth.uid()
-- devuelve 42501 aunque GRANT INSERT exista.
--
-- Causas típicas:
--   1) Políticas legacy duplicadas en `servicios`
--   2) Función user_can_insert_servicio desactualizada
--   3) Petición como rol `anon` (sin JWT) — policy es TO authenticated
--
-- Ejecutar en Supabase SQL Editor (proyecto Demo o el que use la app).
-- =============================================================================

-- ─── Funciones (misma lógica que 20260521150000 + repair) ───────────────────
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

CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(p_empresa_id uuid, p_conductor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- A) Jefe de flota
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
    -- B) Autónomo PRO / conductor propio: empresa_id NULL, conductor = yo
    OR (
      auth.uid() IS NOT NULL
      AND p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND (
        p_empresa_id IS NULL
        OR public.user_can_access_empresa(p_empresa_id)
      )
    )
    -- C) Jefe asigna conductor de su flota
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
  'INSERT servicios: flota, autónomo PRO (empresa_id null + conductor_id=auth.uid), o asignación jefe.';

REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated;

-- ─── Eliminar TODAS las políticas legacy en servicios ───────────────────────
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

-- Endurecer: anon sin DML (si aún aparece en grants, esto lo corrige)
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
