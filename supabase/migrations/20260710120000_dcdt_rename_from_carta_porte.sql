-- Renombrar carta_porte_servicio → dcdt_servicio (solo si existe la tabla antigua)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'carta_porte_servicio'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dcdt_servicio'
  ) THEN
    ALTER TABLE public.carta_porte_servicio RENAME TO dcdt_servicio;
    ALTER INDEX IF EXISTS idx_carta_porte_empresa RENAME TO idx_dcdt_empresa;
  END IF;
END $$;

-- Migrar estados antiguos
UPDATE public.dcdt_servicio SET estado = 'validado'
  WHERE estado IN ('validado_trafico', 'pdf_generado');
UPDATE public.dcdt_servicio SET estado = 'pendiente_validacion'
  WHERE estado = 'borrador' AND datos IS NOT NULL AND datos <> '{}'::jsonb;

-- Actualizar constraint de estados
ALTER TABLE public.dcdt_servicio DROP CONSTRAINT IF EXISTS carta_porte_servicio_estado_check;
ALTER TABLE public.dcdt_servicio DROP CONSTRAINT IF EXISTS dcdt_servicio_estado_check;
ALTER TABLE public.dcdt_servicio ADD CONSTRAINT dcdt_servicio_estado_check
  CHECK (estado IN (
    'borrador', 'incompleto', 'pendiente_ocr', 'pendiente_validacion',
    'validado', 'incluido_en_expediente'
  ));

COMMENT ON TABLE public.dcdt_servicio IS
  'DCDT por servicio (Documento de Control del Transporte, Orden FOM/2861/2012).';

-- RLS: reemplazar políticas antiguas
DROP POLICY IF EXISTS cps_sel ON public.dcdt_servicio;
DROP POLICY IF EXISTS cps_ins ON public.dcdt_servicio;
DROP POLICY IF EXISTS cps_upd_trafico ON public.dcdt_servicio;
DROP POLICY IF EXISTS cps_upd_conductor ON public.dcdt_servicio;

CREATE OR REPLACE FUNCTION public.user_can_manage_dcdt_trafico(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN RETURN false; END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id AND e.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id AND eu.user_id = auth.uid()
      AND eu.activo = true AND eu.rol IN ('jefe_flota', 'trafico')
  );
END;
$$;

DROP POLICY IF EXISTS dcdt_sel ON public.dcdt_servicio;
CREATE POLICY dcdt_sel ON public.dcdt_servicio FOR SELECT TO authenticated
  USING (
    public.user_can_manage_dcdt_trafico(empresa_id)
    OR public.user_is_servicio_conductor(servicio_id)
    OR EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS dcdt_ins ON public.dcdt_servicio;
CREATE POLICY dcdt_ins ON public.dcdt_servicio FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

DROP POLICY IF EXISTS dcdt_upd_trafico ON public.dcdt_servicio;
CREATE POLICY dcdt_upd_trafico ON public.dcdt_servicio FOR UPDATE TO authenticated
  USING (public.user_can_manage_dcdt_trafico(empresa_id))
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

DROP POLICY IF EXISTS dcdt_upd_conductor ON public.dcdt_servicio;
CREATE POLICY dcdt_upd_conductor ON public.dcdt_servicio FOR UPDATE TO authenticated
  USING (public.user_is_servicio_conductor(servicio_id))
  WITH CHECK (public.user_is_servicio_conductor(servicio_id));

DROP FUNCTION IF EXISTS public.user_can_manage_carta_porte_trafico(uuid);
