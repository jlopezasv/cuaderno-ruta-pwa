-- Contexto operativo en la fila "viva" de ubicaciones (una por user_id).
-- La unicidad por user_id se mantiene; el cliente usa UPSERT (on_conflict=user_id).

DO $$
BEGIN
  IF to_regclass('public.ubicaciones') IS NULL THEN
    RAISE NOTICE 'ubicaciones: tabla no existe, se omite migración';
    RETURN;
  END IF;

  ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL;
  ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS servicio_id uuid REFERENCES public.servicios (id) ON DELETE SET NULL;
  ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS stop_id uuid REFERENCES public.stops (id) ON DELETE SET NULL;
  ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS event_type text;
END;
$$;

COMMENT ON COLUMN public.ubicaciones.empresa_id IS 'Empresa del servicio activo (tracking operativo).';
COMMENT ON COLUMN public.ubicaciones.servicio_id IS 'Servicio activo asociado al punto GPS.';
COMMENT ON COLUMN public.ubicaciones.stop_id IS 'Parada activa / contexto de evento.';
COMMENT ON COLUMN public.ubicaciones.event_type IS 'Último tipo de evento operativo registrado con este GPS.';
