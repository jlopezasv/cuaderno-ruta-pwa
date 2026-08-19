-- Conductor asignado puede INSERTAR el DeCA del viaje (dcdt_servicio) si aún no existe.
-- Tráfico sigue pudiendo crear; no se duplica a nivel de app (ensure + comprobación previa).
-- Amplía user_is_servicio_conductor a servicio_asignaciones (relevos / multi-conductor).

CREATE OR REPLACE FUNCTION public.user_is_servicio_conductor(p_servicio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servicios s
    WHERE s.id = p_servicio_id AND s.conductor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.servicio_asignaciones a
    WHERE a.servicio_id = p_servicio_id AND a.conductor_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_servicio_conductor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_servicio_conductor(uuid) TO authenticated;

DROP POLICY IF EXISTS dcdt_ins ON public.dcdt_servicio;
CREATE POLICY dcdt_ins ON public.dcdt_servicio
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_manage_dcdt_trafico(empresa_id)
    OR (
      public.user_is_servicio_conductor(servicio_id)
      AND EXISTS (
        SELECT 1 FROM public.servicios s
        WHERE s.id = servicio_id AND s.empresa_id = dcdt_servicio.empresa_id
      )
    )
  );
