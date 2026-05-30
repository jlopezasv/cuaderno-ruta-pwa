-- =============================================================================
-- Multi-Conductor V1 — reparación RLS de stops
--
-- Problema detectado en DEMO: la política legacy "stops_acceso" (FOR ALL) comprueba
--   directamente s.conductor_id = auth.uid() OR es_jefe_de(s.conductor_id),
--   por lo que un conductor COLABORADOR (asignado vía servicio_asignaciones, pero
--   que no es el principal) no puede leer/operar las paradas del servicio.
--   Consecuencia: el servicio compartido se cae del "slot activo" del colaborador.
--
-- Arreglo: alinear stops con el resto de tablas usando user_can_access_servicio,
--   que ya contempla al colaborador (multi-conductor V1).
--
-- Idempotente. Elimina TODAS las políticas actuales de stops y crea el conjunto
--   estándar (sel/ins/upd/del). Ejecutar en el SQL Editor de DEMO.
-- =============================================================================

ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stops TO authenticated;
GRANT ALL ON public.stops TO service_role;

-- Eliminar cualquier política previa (incluida la legacy "stops_acceso")
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stops'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.stops', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "stp_sel" ON public.stops
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "stp_ins" ON public.stops
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "stp_upd" ON public.stops
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(servicio_id))
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "stp_del" ON public.stops
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(servicio_id));
