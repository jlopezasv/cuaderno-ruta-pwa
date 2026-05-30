-- Multi-Conductor FASE 2A: estado de participación individual por conductor.
-- Permite que cada conductor finalice SU participación sin cerrar el servicio global.
-- NO modifica servicios.estado, ni la cola FIFO, ni el expediente, ni cálculo de horas.

ALTER TABLE public.servicio_asignaciones
  ADD COLUMN IF NOT EXISTS estado_participacion text NOT NULL DEFAULT 'pendiente';

ALTER TABLE public.servicio_asignaciones
  ADD COLUMN IF NOT EXISTS fecha_inicio_participacion timestamptz;

ALTER TABLE public.servicio_asignaciones
  ADD COLUMN IF NOT EXISTS fecha_fin_participacion timestamptz;

-- Valores permitidos: pendiente | activo | finalizado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'servicio_asignaciones_estado_participacion_chk'
  ) THEN
    ALTER TABLE public.servicio_asignaciones
      ADD CONSTRAINT servicio_asignaciones_estado_participacion_chk
      CHECK (estado_participacion IN ('pendiente', 'activo', 'finalizado'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_servicio_asignaciones_participacion
  ON public.servicio_asignaciones (conductor_id, estado_participacion);

COMMENT ON COLUMN public.servicio_asignaciones.estado_participacion IS
  'Multi-conductor FASE 2A: pendiente | activo | finalizado. Estado individual del conductor, independiente de servicios.estado. finalizado libera al conductor sin cerrar el servicio.';
COMMENT ON COLUMN public.servicio_asignaciones.fecha_inicio_participacion IS
  'Multi-conductor FASE 2A: inicio de la participación del conductor (reservado para cálculo de horas en FASE 2B).';
COMMENT ON COLUMN public.servicio_asignaciones.fecha_fin_participacion IS
  'Multi-conductor FASE 2A: fin de la participación del conductor (al finalizar su parte sin cerrar el servicio).';
