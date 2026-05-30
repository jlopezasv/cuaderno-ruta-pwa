-- =============================================================================
-- Multi-Conductor V1 — reparación RLS de evidencias
--
-- Problema en DEMO: la política legacy "evidencias_acceso" (FOR ALL) comprueba
--   s.conductor_id = auth.uid() OR es_jefe_de(s.conductor_id) (vía stops→servicios),
--   por lo que un conductor COLABORADOR no puede ver ni subir fotos/CMR/documentos
--   del servicio compartido.
--
-- Arreglo: alinear evidencias con la versión canónica del repo
--   (user_can_access_servicio, con rama de incidencias), que ya contempla al
--   colaborador (multi-conductor V1).
--
-- Idempotente. Elimina TODAS las políticas actuales de evidencias y crea el
--   conjunto estándar (sel/ins/upd/del). Ejecutar en el SQL Editor de DEMO.
-- =============================================================================

ALTER TABLE public.evidencias ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidencias TO authenticated;
GRANT ALL ON public.evidencias TO service_role;

-- Eliminar cualquier política previa (incluida la legacy "evidencias_acceso")
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'evidencias'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.evidencias', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "ev_sel" ON public.evidencias
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.incidencias inc
      WHERE inc.id = evidencias.incidencia_id
        AND public.user_can_access_servicio(inc.servicio_id)
    )
  );

CREATE POLICY "ev_ins" ON public.evidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    AND (
      evidencias.incidencia_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.incidencias inc
        WHERE inc.id = evidencias.incidencia_id
          AND inc.servicio_id = (
            SELECT st2.servicio_id FROM public.stops st2 WHERE st2.id = evidencias.stop_id
          )
          AND public.user_can_access_servicio(inc.servicio_id)
      )
    )
  );

CREATE POLICY "ev_upd" ON public.evidencias
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.incidencias inc
      WHERE inc.id = evidencias.incidencia_id
        AND public.user_can_access_servicio(inc.servicio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    AND (
      evidencias.incidencia_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.incidencias inc
        WHERE inc.id = evidencias.incidencia_id
          AND public.user_can_access_servicio(inc.servicio_id)
      )
    )
  );

CREATE POLICY "ev_del" ON public.evidencias
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.incidencias inc
      WHERE inc.id = evidencias.incidencia_id
        AND public.user_can_access_servicio(inc.servicio_id)
    )
  );
