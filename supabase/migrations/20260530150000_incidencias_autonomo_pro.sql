-- =============================================================================
-- Incidencias operativas — soporte Autónomo PRO (servicios.empresa_id NULL)
--
-- Síntoma: RAISE 'incidencias: servicio sin empresa_id' al crear incidencia
-- en servicio propio (conductor_id = auth.uid(), empresa_id null).
--
-- Ejecutar en Supabase SQL Editor (Demo / Prod).
-- =============================================================================

-- empresa_id opcional en incidencias (flota vs autónomo)
ALTER TABLE public.incidencias
  ALTER COLUMN empresa_id DROP NOT NULL;

COMMENT ON COLUMN public.incidencias.empresa_id IS
  'Tenant empresa (flota). NULL si el servicio es Autónomo PRO (solo conductor_id).';

-- Trigger: validar ownership servicio ↔ incidencia (flota y autónomo)
CREATE OR REPLACE FUNCTION public.incidencias_validate_servicio_stop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_conductor uuid;
BEGIN
  SELECT s.empresa_id, s.conductor_id
  INTO v_empresa, v_conductor
  FROM public.servicios s
  WHERE s.id = NEW.servicio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'incidencias: servicio no encontrado';
  END IF;

  -- Autónomo PRO: servicio sin empresa, conductor dueño del servicio
  IF v_empresa IS NULL THEN
    IF v_conductor IS NULL OR v_conductor IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'incidencias: servicio autónomo sin ownership válido para el usuario actual';
    END IF;
    IF NEW.empresa_id IS NOT NULL THEN
      RAISE EXCEPTION 'incidencias: empresa_id debe ser null para servicio autónomo';
    END IF;
    NEW.empresa_id := NULL;
    IF NEW.conductor_id IS NULL THEN
      NEW.conductor_id := auth.uid();
    ELSIF NEW.conductor_id IS DISTINCT FROM v_conductor
      AND NEW.conductor_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'incidencias: conductor_id no coincide con el servicio';
    END IF;
  ELSE
  -- Flota empresa
    IF NEW.empresa_id IS DISTINCT FROM v_empresa THEN
      RAISE EXCEPTION 'incidencias: empresa_id no coincide con el servicio';
    END IF;
  END IF;

  IF NEW.stop_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stops st
    WHERE st.id = NEW.stop_id AND st.servicio_id = NEW.servicio_id
  ) THEN
    RAISE EXCEPTION 'incidencias: stop_id no pertenece al servicio';
  END IF;

  RETURN NEW;
END;
$$;

-- RLS INSERT: empresa_id nullable (IS NOT DISTINCT FROM servicio.empresa_id)
DROP POLICY IF EXISTS "inc_ins" ON public.incidencias;

CREATE POLICY "inc_ins" ON public.incidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_servicio(servicio_id)
    AND empresa_id IS NOT DISTINCT FROM (
      SELECT sv.empresa_id FROM public.servicios sv WHERE sv.id = servicio_id
    )
    AND (
      stop_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.stops st
        WHERE st.id = stop_id AND st.servicio_id = incidencias.servicio_id
      )
    )
  );
