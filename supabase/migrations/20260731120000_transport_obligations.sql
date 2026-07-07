-- Transport Obligation — Planning BC (Sprint 3)
-- Agregado: obligación logística neutral (no pedido comercial, no expedición).
-- DEMO: node scripts/apply-sql-file.mjs supabase/migrations/20260731120000_transport_obligations.sql

-- ── 1) Tabla agregado ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transport_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'received'
    CHECK (state IN (
      'received', 'planned', 'in_execution', 'partially_fulfilled',
      'fulfilled', 'cancelled', 'superseded'
    )),
  external_reference jsonb,
  expedition_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  lines_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_obligation_id uuid REFERENCES public.transport_obligations (id) ON DELETE SET NULL,
  child_obligation_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  superseded_by_obligation_id uuid REFERENCES public.transport_obligations (id) ON DELETE SET NULL,
  merged_into_obligation_id uuid REFERENCES public.transport_obligations (id) ON DELETE SET NULL,
  replan_version integer NOT NULL DEFAULT 0,
  cancelled_at timestamptz,
  fulfilled_at timestamptz,
  planning_domain_schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.transport_obligations IS
  'Planning BC — Transport Obligation. Obligación logística a ejecutar; fuente para conectores ERP/WMS.';

CREATE INDEX IF NOT EXISTS idx_transport_obligations_empresa
  ON public.transport_obligations (empresa_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_transport_obligations_state
  ON public.transport_obligations (state);

-- ── 2) Vínculo expedición (Execution) ↔ obligación (Planning) ────────────────

CREATE TABLE IF NOT EXISTS public.transport_obligation_expeditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_obligation_id uuid NOT NULL
    REFERENCES public.transport_obligations (id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL
    REFERENCES public.servicios (id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT transport_obligation_expeditions_servicio_unique UNIQUE (servicio_id)
);

COMMENT ON TABLE public.transport_obligation_expeditions IS
  'Una expedición (servicio) pertenece como máximo a una Transport Obligation.';

CREATE INDEX IF NOT EXISTS idx_transport_obligation_expeditions_obligation
  ON public.transport_obligation_expeditions (transport_obligation_id);

-- ── 3) Eventos de dominio (append-only) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transport_obligation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_obligation_id uuid NOT NULL
    REFERENCES public.transport_obligations (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.transport_obligation_events IS
  'Eventos append-only del agregado Transport Obligation.';

CREATE INDEX IF NOT EXISTS idx_transport_obligation_events_obligation
  ON public.transport_obligation_events (transport_obligation_id, occurred_at DESC);

-- ── 4) Trigger updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.transport_obligations_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transport_obligations_set_updated_at ON public.transport_obligations;
CREATE TRIGGER transport_obligations_set_updated_at
  BEFORE UPDATE ON public.transport_obligations
  FOR EACH ROW
  EXECUTE PROCEDURE public.transport_obligations_set_updated_at();

-- ── 5) RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.transport_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_obligation_expeditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_obligation_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.transport_obligations TO authenticated;
GRANT SELECT, INSERT ON public.transport_obligation_expeditions TO authenticated;
GRANT SELECT, INSERT ON public.transport_obligation_events TO authenticated;
GRANT ALL ON public.transport_obligations TO service_role;
GRANT ALL ON public.transport_obligation_expeditions TO service_role;
GRANT ALL ON public.transport_obligation_events TO service_role;

DROP POLICY IF EXISTS "to_sel" ON public.transport_obligations;
DROP POLICY IF EXISTS "to_ins" ON public.transport_obligations;
DROP POLICY IF EXISTS "to_upd" ON public.transport_obligations;

CREATE POLICY "to_sel" ON public.transport_obligations
  FOR SELECT TO authenticated
  USING (
    empresa_id IS NULL
    OR public.user_can_access_empresa(empresa_id)
  );

CREATE POLICY "to_ins" ON public.transport_obligations
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id IS NULL
    OR public.user_can_access_empresa(empresa_id)
  );

CREATE POLICY "to_upd" ON public.transport_obligations
  FOR UPDATE TO authenticated
  USING (
    empresa_id IS NULL
    OR public.user_can_access_empresa(empresa_id)
  )
  WITH CHECK (
    empresa_id IS NULL
    OR public.user_can_access_empresa(empresa_id)
  );

DROP POLICY IF EXISTS "toe_sel" ON public.transport_obligation_expeditions;
DROP POLICY IF EXISTS "toe_ins" ON public.transport_obligation_expeditions;

CREATE POLICY "toe_sel" ON public.transport_obligation_expeditions
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "toe_ins" ON public.transport_obligation_expeditions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_servicio(servicio_id));

DROP POLICY IF EXISTS "toev_sel" ON public.transport_obligation_events;
DROP POLICY IF EXISTS "toev_ins" ON public.transport_obligation_events;

CREATE POLICY "toev_sel" ON public.transport_obligation_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transport_obligations o
      WHERE o.id = transport_obligation_id
        AND (o.empresa_id IS NULL OR public.user_can_access_empresa(o.empresa_id))
    )
  );

CREATE POLICY "toev_ins" ON public.transport_obligation_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transport_obligations o
      WHERE o.id = transport_obligation_id
        AND (o.empresa_id IS NULL OR public.user_can_access_empresa(o.empresa_id))
    )
  );
