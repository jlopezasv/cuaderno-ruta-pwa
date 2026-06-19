-- DEMO: alcance de paradas por conductor en servicio_asignaciones (todo | solo_cargas | solo_descargas).
-- DEFAULT 'todo' mantiene comportamiento actual para filas existentes.

ALTER TABLE public.servicio_asignaciones
  ADD COLUMN IF NOT EXISTS participacion_tipo text NOT NULL DEFAULT 'todo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'servicio_asignaciones_participacion_tipo_chk'
  ) THEN
    ALTER TABLE public.servicio_asignaciones
      ADD CONSTRAINT servicio_asignaciones_participacion_tipo_chk
      CHECK (participacion_tipo IN ('todo', 'solo_cargas', 'solo_descargas'));
  END IF;
END$$;

COMMENT ON COLUMN public.servicio_asignaciones.participacion_tipo IS
  'DEMO: alcance operativo del conductor — todo (default) | solo_cargas | solo_descargas.';
