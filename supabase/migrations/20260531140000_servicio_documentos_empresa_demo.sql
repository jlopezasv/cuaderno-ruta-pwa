-- DEMO: documentos de empresa por servicio (separados de servicio_documentos_extra / conductor).
-- Aplicar solo en proyecto Supabase DEMO. No incluir en baseline producción.

CREATE TABLE IF NOT EXISTS public.servicio_documentos_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  subido_por uuid NOT NULL,
  subido_por_nombre text,
  archivo_url text NOT NULL,
  archivo_nombre text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_empresa_servicio
  ON public.servicio_documentos_empresa (servicio_id);

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_empresa_empresa
  ON public.servicio_documentos_empresa (empresa_id);

ALTER TABLE public.servicio_documentos_empresa ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.servicio_documentos_empresa TO authenticated;
GRANT ALL ON public.servicio_documentos_empresa TO service_role;

DROP POLICY IF EXISTS "sdemp_sel" ON public.servicio_documentos_empresa;
DROP POLICY IF EXISTS "sdemp_ins" ON public.servicio_documentos_empresa;
DROP POLICY IF EXISTS "sdemp_del" ON public.servicio_documentos_empresa;

-- Conductor y empresa: leer si tienen acceso al servicio.
CREATE POLICY "sdemp_sel" ON public.servicio_documentos_empresa
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

-- Solo personal de empresa (no conductor sin rol empresa).
CREATE POLICY "sdemp_ins" ON public.servicio_documentos_empresa
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_empresa(empresa_id)
    AND EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id
        AND s.empresa_id = empresa_id
    )
    AND subido_por = auth.uid()
  );

CREATE POLICY "sdemp_del" ON public.servicio_documentos_empresa
  FOR DELETE TO authenticated
  USING (public.user_can_access_empresa(empresa_id));

COMMENT ON TABLE public.servicio_documentos_empresa IS
  'DEMO: documentos subidos por la empresa al servicio. Almacenamiento independiente del conductor (servicio_documentos_extra).';
