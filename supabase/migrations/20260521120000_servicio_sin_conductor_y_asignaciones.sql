-- Servicios sin conductor (planificación empresa) + tabla servicio_asignaciones (relevos futuros).

-- conductor_id opcional en servicios
ALTER TABLE public.servicios
  ALTER COLUMN conductor_id DROP NOT NULL;

COMMENT ON COLUMN public.servicios.conductor_id IS
  'Conductor principal / responsable. NULL = pendiente de asignación (solo empresa hasta asignar).';

-- Tabla de asignaciones por servicio / parada (fase relevos)
CREATE TABLE IF NOT EXISTS public.servicio_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  stop_id uuid REFERENCES public.stops (id) ON DELETE SET NULL,
  conductor_id uuid NOT NULL,
  tipo_asignacion text NOT NULL DEFAULT 'principal',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servicio_asignaciones_servicio
  ON public.servicio_asignaciones (servicio_id);

CREATE INDEX IF NOT EXISTS idx_servicio_asignaciones_stop
  ON public.servicio_asignaciones (stop_id)
  WHERE stop_id IS NOT NULL;

ALTER TABLE public.servicio_asignaciones ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicio_asignaciones TO authenticated;
GRANT ALL ON public.servicio_asignaciones TO service_role;

DROP POLICY IF EXISTS "sa_sel" ON public.servicio_asignaciones;
DROP POLICY IF EXISTS "sa_ins" ON public.servicio_asignaciones;
DROP POLICY IF EXISTS "sa_upd" ON public.servicio_asignaciones;
DROP POLICY IF EXISTS "sa_del" ON public.servicio_asignaciones;

CREATE POLICY "sa_sel" ON public.servicio_asignaciones
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sa_ins" ON public.servicio_asignaciones
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sa_upd" ON public.servicio_asignaciones
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(servicio_id))
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sa_del" ON public.servicio_asignaciones
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(servicio_id));
