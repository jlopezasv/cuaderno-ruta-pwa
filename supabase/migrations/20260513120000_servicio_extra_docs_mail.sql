-- Documentación extra por servicio (no ligada a stop) + historial de envíos por email.
-- Ejecutar en Supabase SQL Editor si no usas migraciones CLI.
-- RLS unificada por servicio + función user_can_access_servicio: aplicar también
-- supabase/migrations/20260514120000_rls_servicio_ownership_core.sql

CREATE TABLE IF NOT EXISTS public.servicio_documentos_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descripcion text,
  url text,
  archivo_nombre text,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_extra_servicio
  ON public.servicio_documentos_extra (servicio_id);

CREATE TABLE IF NOT EXISTS public.documentacion_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  destinatarios text NOT NULL,
  asunto text NOT NULL,
  mensaje text,
  adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado text NOT NULL DEFAULT 'enviado',
  error_detalle text,
  enviado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentacion_envios_servicio
  ON public.documentacion_envios (servicio_id);

ALTER TABLE public.servicio_documentos_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentacion_envios ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para usuarios autenticados con rol en el servicio (conductor).
-- Ajustar si usáis RLS más estricta por empresa.
DROP POLICY IF EXISTS "sde_read_conductor" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_sel" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_ins" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_upd" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_del" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_write_conductor" ON public.servicio_documentos_extra;
CREATE POLICY "sde_sel" ON public.servicio_documentos_extra
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );
CREATE POLICY "sde_ins" ON public.servicio_documentos_extra
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );
CREATE POLICY "sde_upd" ON public.servicio_documentos_extra
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );
CREATE POLICY "sde_del" ON public.servicio_documentos_extra
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "de_read_conductor" ON public.documentacion_envios;
CREATE POLICY "de_read_conductor" ON public.documentacion_envios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "de_insert_conductor" ON public.documentacion_envios;
CREATE POLICY "de_insert_conductor" ON public.documentacion_envios
  FOR INSERT TO authenticated
  WITH CHECK (
    enviado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );
