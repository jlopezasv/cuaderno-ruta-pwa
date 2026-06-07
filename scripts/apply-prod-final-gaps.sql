-- =============================================================================
-- REAL (glyexutcypmhkndvmcxd) — gaps release producción (idempotente)
-- Ejecutar en SQL Editor si preflight-prod-sql-audit.sql marca FALTA en:
--   06_mail_cliente | 05_documentos_empresa | 07_conductor_empresa
--
-- NO aplica: empresa_usuarios, responsable_user_id, 202606* (salvo lookup ya hecho)
-- =============================================================================

-- ─── 1) Mail cliente (documentacion_envios) ───
ALTER TABLE public.documentacion_envios
  ADD COLUMN IF NOT EXISTS cc text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS destinatario text,
  ADD COLUMN IF NOT EXISTS remitente_mostrado text,
  ADD COLUMN IF NOT EXISTS reply_to text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

COMMENT ON COLUMN public.documentacion_envios.cc IS 'Copia (CC) del envío al cliente';
COMMENT ON COLUMN public.documentacion_envios.sent_at IS 'Marca de tiempo del envío efectivo';
COMMENT ON COLUMN public.documentacion_envios.destinatario IS 'Email principal (Para)';
COMMENT ON COLUMN public.documentacion_envios.remitente_mostrado IS 'From mostrado al cliente';
COMMENT ON COLUMN public.documentacion_envios.reply_to IS 'Reply-To (email ficha empresa)';
COMMENT ON COLUMN public.documentacion_envios.provider IS 'resend | simulacion';
COMMENT ON COLUMN public.documentacion_envios.provider_message_id IS 'ID mensaje Resend (si aplica)';

-- ─── 2) Documentos empresa (servicio_documentos_empresa + sdemp_*) ───
-- Equivalente a 20260531150000_servicio_documentos_empresa.sql

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

CREATE POLICY "sdemp_sel" ON public.servicio_documentos_empresa
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

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
  'Documentos subidos por la empresa al servicio.';

-- ─── 3) Teléfono conductor ───
ALTER TABLE public.conductor_empresa
  ADD COLUMN IF NOT EXISTS telefono_movil text;

COMMENT ON COLUMN public.conductor_empresa.telefono_movil IS
  'Teléfono móvil principal del conductor para contacto operativo (jefe de tráfico).';

-- ─── 4) Verificación rápida post-apply ───
SELECT 'mail_cc' AS check_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documentacion_envios' AND column_name = 'cc'
  ) AS ok
UNION ALL SELECT 'mail_provider_message_id',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documentacion_envios' AND column_name = 'provider_message_id'
  )
UNION ALL SELECT 'tabla_servicio_documentos_empresa',
  to_regclass('public.servicio_documentos_empresa') IS NOT NULL
UNION ALL SELECT 'policy_sdemp_sel',
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'servicio_documentos_empresa' AND policyname = 'sdemp_sel'
  )
UNION ALL SELECT 'col_ce_telefono_movil',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conductor_empresa' AND column_name = 'telefono_movil'
  );
