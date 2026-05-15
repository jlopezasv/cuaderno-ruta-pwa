-- Empresa/jefe puede leer documentos extra de servicios a los que tiene acceso.
-- Idempotente: re-aplica políticas con user_can_access_servicio (sustituye solo-conductor).

CREATE OR REPLACE FUNCTION public.user_can_access_servicio(servicio_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        (s.conductor_id IS NOT NULL AND s.conductor_id = auth.uid())
        OR (
          s.empresa_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.empresas e
            WHERE e.id = s.empresa_id
              AND e.owner_id IS NOT NULL
              AND e.owner_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          INNER JOIN public.empresas e ON e.id = ce.empresa_id
          WHERE s.conductor_id IS NOT NULL
            AND ce.user_id = s.conductor_id
            AND (ce.activo IS DISTINCT FROM false)
            AND e.owner_id = auth.uid()
        )
      FROM public.servicios s
      WHERE s.id = servicio_uuid
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;

ALTER TABLE public.servicio_documentos_extra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sde_read_conductor" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_sel" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_ins" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_upd" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_del" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_write_conductor" ON public.servicio_documentos_extra;

CREATE POLICY "sde_sel" ON public.servicio_documentos_extra
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sde_ins" ON public.servicio_documentos_extra
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sde_upd" ON public.servicio_documentos_extra
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(servicio_id))
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sde_del" ON public.servicio_documentos_extra
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

-- Relleno empresa_id en filas antiguas (filtros empresa en UI)
UPDATE public.servicio_documentos_extra d
SET empresa_id = s.empresa_id
FROM public.servicios s
WHERE d.servicio_id = s.id
  AND d.empresa_id IS NULL
  AND s.empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_extra_empresa
  ON public.servicio_documentos_extra (empresa_id);
