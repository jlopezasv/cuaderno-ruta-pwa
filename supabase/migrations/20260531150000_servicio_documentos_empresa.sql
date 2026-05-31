-- Documentos subidos por la empresa al servicio (independientes de servicio_documentos_extra).
-- Idempotente: no borra tablas ni datos existentes.
-- Prerrequisitos en el mismo proyecto Supabase:
--   public.servicios, public.empresas
--   public.user_can_access_servicio(uuid)
--   public.user_can_access_empresa(uuid)
--   (recomendado: 20260514120000_rls_servicio_ownership_core.sql y
--    20260530170000_multi_conductor_v1_asignaciones_select.sql ya aplicadas)

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

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_empresa_servicio_created
  ON public.servicio_documentos_empresa (servicio_id, created_at DESC);

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

-- Solo personal de empresa (owner / membresía vía user_can_access_empresa).
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
  'Documentos subidos por la empresa al servicio. Almacenamiento en bucket operativo (ruta documentos_empresa/{empresa_id}/{servicio_id}/).';
