-- DeCA autónomo: documentos de control creados por conductores sin panel empresa.
-- Independiente de dcdt_servicio (flota / tráfico).

CREATE TABLE IF NOT EXISTS public.deca_autonomo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'generado', 'archivado')),
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  deca_public_id uuid NOT NULL DEFAULT gen_random_uuid(),
  pdf_generado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deca_autonomo_public_id_unique UNIQUE (deca_public_id)
);

CREATE INDEX IF NOT EXISTS idx_deca_autonomo_user_updated
  ON public.deca_autonomo (user_id, updated_at DESC);

COMMENT ON TABLE public.deca_autonomo IS
  'DeCA creados por conductores autónomos / individuales (sin empresa operativa).';

ALTER TABLE public.deca_autonomo ENABLE ROW LEVEL SECURITY;

CREATE POLICY deca_autonomo_select_own ON public.deca_autonomo
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY deca_autonomo_insert_own ON public.deca_autonomo
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY deca_autonomo_update_own ON public.deca_autonomo
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY deca_autonomo_delete_borrador ON public.deca_autonomo
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND estado = 'borrador');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deca_autonomo TO authenticated;
GRANT ALL ON public.deca_autonomo TO service_role;
