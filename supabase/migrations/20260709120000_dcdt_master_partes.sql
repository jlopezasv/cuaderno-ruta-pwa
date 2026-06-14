-- =============================================================================
-- DCDT — master_partes_transporte + documento por servicio (dcdt_servicio)
-- Sin duplicar datos: referencias + overrides mínimos en JSON
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.master_partes_transporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('cargador', 'expedidor', 'destinatario', 'operador')),
  nombre text NOT NULL,
  nif text,
  domicilio_fiscal text,
  direccion_operativa text,
  ciudad text,
  codigo_postal text,
  pais text DEFAULT 'ES',
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_partes_nombre_min CHECK (char_length(trim(nombre)) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_master_partes_empresa_tipo
  ON public.master_partes_transporte (empresa_id, tipo)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_master_partes_empresa_nombre
  ON public.master_partes_transporte (empresa_id, lower(nombre));

COMMENT ON TABLE public.master_partes_transporte IS
  'Catálogo de partes (cargador, destinatario, operador) por empresa. Fuente para DCDT.';

CREATE TABLE IF NOT EXISTS public.dcdt_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL UNIQUE REFERENCES public.servicios (id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN (
      'borrador',
      'incompleto',
      'pendiente_ocr',
      'pendiente_validacion',
      'validado',
      'incluido_en_expediente'
    )),
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  validado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  validado_at timestamptz,
  pdf_generado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dcdt_empresa
  ON public.dcdt_servicio (empresa_id, updated_at DESC);

COMMENT ON TABLE public.dcdt_servicio IS
  'DCDT por servicio: referencias master + mercancía + OCR. Tráfico valida antes de expediente.';

COMMENT ON COLUMN public.dcdt_servicio.datos IS
  'JSON: partes{*_id, *_overrides}, mercancia{}, stops[], ocr_ultimo, observaciones';

CREATE OR REPLACE FUNCTION public.user_can_manage_dcdt_trafico(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1 FROM public.empresas e
    WHERE e.id = p_empresa_id AND e.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.rol IN ('jefe_flota', 'trafico')
  );
END;
$$;

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
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) TO authenticated;

ALTER TABLE public.master_partes_transporte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mpt_sel ON public.master_partes_transporte;
CREATE POLICY mpt_sel ON public.master_partes_transporte
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_office_peer(empresa_id)
    OR EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = empresa_id AND e.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.conductor_empresa ce
      WHERE ce.empresa_id = master_partes_transporte.empresa_id
        AND ce.user_id = auth.uid()
        AND ce.activo = true
    )
  );

DROP POLICY IF EXISTS mpt_ins ON public.master_partes_transporte;
CREATE POLICY mpt_ins ON public.master_partes_transporte
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

DROP POLICY IF EXISTS mpt_upd ON public.master_partes_transporte;
CREATE POLICY mpt_upd ON public.master_partes_transporte
  FOR UPDATE TO authenticated
  USING (public.user_can_manage_dcdt_trafico(empresa_id))
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

GRANT SELECT, INSERT, UPDATE ON public.master_partes_transporte TO authenticated;

ALTER TABLE public.dcdt_servicio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dcdt_sel ON public.dcdt_servicio;
CREATE POLICY dcdt_sel ON public.dcdt_servicio
  FOR SELECT TO authenticated
  USING (
    public.user_can_manage_dcdt_trafico(empresa_id)
    OR public.user_is_servicio_conductor(servicio_id)
    OR EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = empresa_id AND e.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS dcdt_ins ON public.dcdt_servicio;
CREATE POLICY dcdt_ins ON public.dcdt_servicio
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

DROP POLICY IF EXISTS dcdt_upd_trafico ON public.dcdt_servicio;
CREATE POLICY dcdt_upd_trafico ON public.dcdt_servicio
  FOR UPDATE TO authenticated
  USING (public.user_can_manage_dcdt_trafico(empresa_id))
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

DROP POLICY IF EXISTS dcdt_upd_conductor ON public.dcdt_servicio;
CREATE POLICY dcdt_upd_conductor ON public.dcdt_servicio
  FOR UPDATE TO authenticated
  USING (public.user_is_servicio_conductor(servicio_id))
  WITH CHECK (public.user_is_servicio_conductor(servicio_id));

GRANT SELECT, INSERT, UPDATE ON public.dcdt_servicio TO authenticated;
