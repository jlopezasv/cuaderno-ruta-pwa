-- Jefe de flota: leer ubicaciones GPS de conductores activos de su empresa.
-- Complementa la política ubi_sel (conductor lee la suya). Sin esto el panel empresa
-- no puede leer public.ubicaciones de la flota vía PostgREST.

DROP POLICY IF EXISTS "ubi_sel_empresa_flota" ON public.ubicaciones;

CREATE POLICY "ubi_sel_empresa_flota" ON public.ubicaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      INNER JOIN public.empresas e ON e.id = ce.empresa_id AND e.owner_id = auth.uid()
      WHERE ce.user_id = ubicaciones.user_id
        AND (ce.activo IS DISTINCT FROM false)
    )
  );
