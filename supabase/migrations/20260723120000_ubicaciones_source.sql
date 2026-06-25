-- Origen del último punto GPS (manual, evento operativo, etc.).
DO $$
BEGIN
  IF to_regclass('public.ubicaciones') IS NULL THEN
    RAISE NOTICE 'ubicaciones: tabla no existe, se omite migración source';
    RETURN;
  END IF;

  ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS source text;
END;
$$;

COMMENT ON COLUMN public.ubicaciones.source IS 'Origen del punto: actualizacion_manual, ruta_iniciada, entrada_muelle, etc.';
