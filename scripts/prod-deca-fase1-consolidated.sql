-- =============================================================================
-- PRODUCCIÓN DeCA — Fase 1 SQL consolidado
-- Proyecto: glyexutcypmhkndvmcxd (cuadernoderutapro.es)
-- Generado: 2026-06-05 — NO ejecutar sin Fase 0 OK
--
-- PRERREQUISITOS (ejecutar ANTES si Fase 0 indica que faltan):
--   is_superadmin_agenda_user  → supabase/migrations/20260706120000_admin_agenda_comercial.sql
--   user_is_active_office_peer → supabase/migrations/20260617120000_empresa_usuarios_oficina_prod.sql
--   user_can_access_servicio   → baseline mayo 202605 (debe existir)
--
-- ORDEN INTERNO:
--   1 retention_framework  2 dcdt_master_partes  3 rename  4 fix_volatility
--   5 domicilio  6 dcdt_pdf_retention  7 deca_public_id  8 conductor_vehiculo
-- =============================================================================


-- >>> FILE: supabase/migrations/20260708120000_data_retention_framework.sql

-- =============================================================================
-- Marco de retención de datos — preparación (sin borrados, sin cron).
-- GPS, OCR/CMR, fotos, documentos, expedientes operacionales.
-- Estados: ACTIVO | ARCHIVADO | BORRABLE
-- purge_enabled = false hasta activación manual futura.
-- =============================================================================

-- ─── Admin gate (reutiliza criterio super_admin) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.is_retention_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin_agenda_user();
$$;

REVOKE ALL ON FUNCTION public.is_retention_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_retention_admin() TO authenticated;

-- ─── Meta framework ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_framework_meta (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.retention_framework_meta (key, value)
VALUES (
  'framework',
  jsonb_build_object(
    'version', 1,
    'purge_enabled', false,
    'description', 'Marco de retención — simulación activa, borrado desactivado'
  )
)
ON CONFLICT (key) DO NOTHING;

-- ─── Catálogo de clases de activo ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_asset_catalog (
  asset_class text PRIMARY KEY,
  label text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('RETENIDO', 'ARCHIVABLE', 'ELIMINABLE')),
  entity_hint text,
  includes_storage boolean NOT NULL DEFAULT false,
  description text
);

INSERT INTO public.retention_asset_catalog (asset_class, label, tier, entity_hint, includes_storage, description)
VALUES
  ('servicio_metadata', 'Metadatos servicio / expediente', 'RETENIDO', 'servicios', false,
   'Referencia operativa y legal; no se purga automáticamente.'),
  ('documentacion_envios', 'Log envíos email documentación', 'RETENIDO', 'documentacion_envios', false,
   'Auditoría de comunicaciones con cliente.'),
  ('evidencia_cmr_ocr', 'CMR + OCR', 'RETENIDO', 'evidencias', true,
   'Imagen CMR y JSON OCR en evidencias.datos.'),
  ('evidencia_foto', 'Fotos parada', 'ARCHIVABLE', 'evidencias', true,
   'Fotos comprimidas en bucket user-photos.'),
  ('evidencia_pdf', 'PDF operativo', 'ARCHIVABLE', 'evidencias', true,
   'PDF en paradas o extras.'),
  ('servicio_documentos_extra', 'Documentos extra viaje', 'ARCHIVABLE', 'servicio_documentos_extra', true,
   'Archivos no ligados a stop.'),
  ('servicio_documentos_empresa', 'Documentos empresa', 'ARCHIVABLE', 'servicio_documentos_empresa', true,
   'Documentación corporativa del servicio.'),
  ('gps_ubicacion_viva', 'GPS posición actual', 'RETENIDO', 'ubicaciones', false,
   'Última posición por conductor (UPSERT).'),
  ('gps_trazas_historicas', 'Trazas GPS históricas', 'ELIMINABLE', 'ubicaciones', false,
   'Reservado para series densas futuras.'),
  ('incidencia_nota', 'Incidencias / notas texto', 'RETENIDO', 'evidencias', false,
   'Texto sin binario pesado.'),
  ('perfil_foto', 'Foto perfil conductor', 'ARCHIVABLE', 'profiles', true,
   'Avatar en storage.')
ON CONFLICT (asset_class) DO NOTHING;

-- ─── Política por clase (días) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_policy_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global', 'empresa')),
  empresa_id uuid REFERENCES public.empresas (id) ON DELETE CASCADE,
  asset_class text NOT NULL REFERENCES public.retention_asset_catalog (asset_class),
  days_until_archivable integer NOT NULL DEFAULT 0,
  days_until_borable integer NOT NULL DEFAULT 0,
  min_retention_days integer NOT NULL DEFAULT 0,
  purge_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_policy_scope_empresa_chk CHECK (
    (scope = 'global' AND empresa_id IS NULL)
    OR (scope = 'empresa' AND empresa_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policy_global_asset
  ON public.retention_policy_config (asset_class)
  WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policy_empresa_asset
  ON public.retention_policy_config (empresa_id, asset_class)
  WHERE scope = 'empresa';

-- Defaults globales (días desde cierre de servicio salvo RETENIDO)
INSERT INTO public.retention_policy_config (
  scope, empresa_id, asset_class,
  days_until_archivable, days_until_borable, min_retention_days, purge_enabled, notes
)
SELECT v.scope, v.empresa_id, v.asset_class, v.da, v.db, v.mn, false, v.notes
FROM (VALUES
  ('global'::text, NULL::uuid, 'servicio_metadata', 0, 0, 0, 'Siempre ACTIVO'),
  ('global', NULL, 'documentacion_envios', 0, 0, 2555, '7 años mínimo sugerido'),
  ('global', NULL, 'evidencia_cmr_ocr', 365, 1825, 730, '2 años activo; archivo hasta 5'),
  ('global', NULL, 'evidencia_foto', 180, 545, 365, '6m activo tras cierre; 18m archivo'),
  ('global', NULL, 'evidencia_pdf', 180, 545, 365, 'Igual que fotos'),
  ('global', NULL, 'servicio_documentos_extra', 180, 545, 365, NULL),
  ('global', NULL, 'servicio_documentos_empresa', 365, 1095, 730, NULL),
  ('global', NULL, 'gps_ubicacion_viva', 0, 0, 0, 'Siempre ACTIVO'),
  ('global', NULL, 'gps_trazas_historicas', 90, 365, 30, 'Solo si se activa histórico'),
  ('global', NULL, 'incidencia_nota', 730, 0, 365, '2 años activo mínimo'),
  ('global', NULL, 'perfil_foto', 365, 1095, 180, 'Tras perfil archivado')
) AS v(scope, empresa_id, asset_class, da, db, mn, notes)
ON CONFLICT DO NOTHING;

-- ─── Log simulaciones (dry-run) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_simulation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL,
  run_by uuid,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retention_simulation_created
  ON public.retention_simulation_log (created_at DESC);

-- ─── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retention_servicio_reference_at(s public.servicios)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(s.updated_at, s.created_at);
$$;

CREATE OR REPLACE FUNCTION public.retention_servicio_is_closed(estado text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(estado, '')) IN ('completado', 'cerrado', 'cancelado', 'anulado');
$$;

CREATE OR REPLACE FUNCTION public.retention_estimate_evidencia_bytes(e public.evidencias)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF((e.datos -> 'doc_meta' ->> 'size_original_bytes')::bigint, 0),
    NULLIF((e.datos -> 'doc_meta' ->> 'size_bytes')::bigint, 0),
    NULLIF((e.datos -> 'doc_meta' ->> 'size_preview_bytes')::bigint, 0),
    CASE WHEN e.url IS NOT NULL AND e.url <> '' THEN 51200 ELSE 1024 END
  );
$$;

CREATE OR REPLACE FUNCTION public.retention_compute_state(
  p_tier text,
  p_servicio_cerrado boolean,
  p_age_days integer,
  p_days_archivable integer,
  p_days_borable integer,
  p_min_retention integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_tier = 'RETENIDO' THEN
    RETURN 'ACTIVO';
  END IF;
  IF NOT p_servicio_cerrado THEN
    RETURN 'ACTIVO';
  END IF;
  IF p_age_days < GREATEST(p_min_retention, 0) THEN
    RETURN 'ACTIVO';
  END IF;
  IF p_age_days < GREATEST(p_days_archivable, 0) THEN
    RETURN 'ACTIVO';
  END IF;
  IF p_tier = 'ELIMINABLE' AND p_age_days >= GREATEST(p_days_archivable + p_days_borable, p_days_borable) THEN
    RETURN 'BORRABLE';
  END IF;
  IF p_tier = 'ARCHIVABLE' AND p_days_borable > 0
     AND p_age_days >= GREATEST(p_days_archivable + p_days_borable, p_days_archivable) THEN
    RETURN 'BORRABLE';
  END IF;
  IF p_age_days >= GREATEST(p_days_archivable, 0) THEN
    RETURN 'ARCHIVADO';
  END IF;
  RETURN 'ACTIVO';
END;
$$;

-- ─── Vista métricas (solo lectura, sin mutar datos) ──────────────────────────
CREATE OR REPLACE VIEW public.v_retention_metrics_summary AS
WITH policy AS (
  SELECT asset_class, days_until_archivable, days_until_borable, min_retention_days, purge_enabled
  FROM public.retention_policy_config
  WHERE scope = 'global'
),
evidencias_rows AS (
  SELECT
    sv.empresa_id,
    CASE
      WHEN e.tipo = 'cmr' THEN 'evidencia_cmr_ocr'
      WHEN e.tipo = 'foto' THEN 'evidencia_foto'
      WHEN e.tipo IN ('incidencia', 'nota') THEN 'incidencia_nota'
      WHEN (e.datos -> 'doc_meta' ->> 'mime_type') ILIKE '%pdf%'
        OR coalesce(e.url, '') ILIKE '%.pdf%' THEN 'evidencia_pdf'
      ELSE 'evidencia_foto'
    END AS asset_class,
    public.retention_compute_state(
      c.tier,
      public.retention_servicio_is_closed(sv.estado),
      GREATEST(0, (EXTRACT(epoch FROM (now() - public.retention_servicio_reference_at(sv))) / 86400)::integer),
      coalesce(p.days_until_archivable, 0),
      coalesce(p.days_until_borable, 0),
      coalesce(p.min_retention_days, 0)
    ) AS retention_state,
    public.retention_estimate_evidencia_bytes(e) AS estimated_bytes
  FROM public.evidencias e
  INNER JOIN public.stops st ON st.id = e.stop_id
  INNER JOIN public.servicios sv ON sv.id = st.servicio_id
  INNER JOIN public.retention_asset_catalog c ON c.asset_class = CASE
      WHEN e.tipo = 'cmr' THEN 'evidencia_cmr_ocr'
      WHEN e.tipo = 'foto' THEN 'evidencia_foto'
      WHEN e.tipo IN ('incidencia', 'nota') THEN 'incidencia_nota'
      WHEN (e.datos -> 'doc_meta' ->> 'mime_type') ILIKE '%pdf%'
        OR coalesce(e.url, '') ILIKE '%.pdf%' THEN 'evidencia_pdf'
      ELSE 'evidencia_foto'
    END
  LEFT JOIN policy p ON p.asset_class = c.asset_class
  WHERE sv.empresa_id IS NOT NULL
),
extra_rows AS (
  SELECT
    sv.empresa_id,
    'servicio_documentos_extra'::text AS asset_class,
    public.retention_compute_state(
      c.tier,
      public.retention_servicio_is_closed(sv.estado),
      GREATEST(0, (EXTRACT(epoch FROM (now() - public.retention_servicio_reference_at(sv))) / 86400)::integer),
      coalesce(p.days_until_archivable, 0),
      coalesce(p.days_until_borable, 0),
      coalesce(p.min_retention_days, 0)
    ) AS retention_state,
    coalesce(sde.size_bytes, 65536)::bigint AS estimated_bytes
  FROM public.servicio_documentos_extra sde
  INNER JOIN public.servicios sv ON sv.id = sde.servicio_id
  INNER JOIN public.retention_asset_catalog c ON c.asset_class = 'servicio_documentos_extra'
  LEFT JOIN policy p ON p.asset_class = 'servicio_documentos_extra'
  WHERE sv.empresa_id IS NOT NULL
),
envios_rows AS (
  SELECT
    sv.empresa_id,
    'documentacion_envios'::text AS asset_class,
    'ACTIVO'::text AS retention_state,
    (length(coalesce(de.destinatarios, '')) + length(coalesce(de.asunto, '')) + length(coalesce(de.mensaje, '')))::bigint AS estimated_bytes
  FROM public.documentacion_envios de
  INNER JOIN public.servicios sv ON sv.id = de.servicio_id
  WHERE sv.empresa_id IS NOT NULL
),
servicio_meta_rows AS (
  SELECT
    sv.empresa_id,
    'servicio_metadata'::text AS asset_class,
    'ACTIVO'::text AS retention_state,
    2048::bigint AS estimated_bytes
  FROM public.servicios sv
  WHERE sv.empresa_id IS NOT NULL
),
ubicaciones_rows AS (
  SELECT
    ce.empresa_id,
    'gps_ubicacion_viva'::text AS asset_class,
    'ACTIVO'::text AS retention_state,
    512::bigint AS estimated_bytes
  FROM public.ubicaciones u
  INNER JOIN public.conductor_empresa ce ON ce.user_id = u.user_id AND ce.activo = true
  WHERE ce.empresa_id IS NOT NULL
),
unioned AS (
  SELECT * FROM evidencias_rows
  UNION ALL SELECT * FROM extra_rows
  UNION ALL SELECT * FROM envios_rows
  UNION ALL SELECT * FROM servicio_meta_rows
  UNION ALL SELECT * FROM ubicaciones_rows
)
SELECT
  empresa_id,
  asset_class,
  retention_state,
  count(*)::bigint AS item_count,
  coalesce(sum(estimated_bytes), 0)::bigint AS estimated_bytes
FROM unioned
GROUP BY empresa_id, asset_class, retention_state;

-- ─── Simulación (NO borra) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retention_run_simulation(
  p_empresa_id uuid DEFAULT NULL,
  p_override_days jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_by_state jsonb;
  v_by_class jsonb;
  v_total_borable_bytes bigint;
  v_purge_enabled boolean;
BEGIN
  IF NOT public.is_retention_admin() THEN
    RAISE EXCEPTION 'retention_run_simulation: acceso denegado' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce((value ->> 'purge_enabled')::boolean, false)
  INTO v_purge_enabled
  FROM public.retention_framework_meta
  WHERE key = 'framework';

  SELECT coalesce(sum(estimated_bytes), 0)
  INTO v_total_borable_bytes
  FROM public.v_retention_metrics_summary m
  WHERE m.retention_state = 'BORRABLE'
    AND (p_empresa_id IS NULL OR m.empresa_id = p_empresa_id);

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_by_state
  FROM (
    SELECT retention_state, sum(item_count) AS items, sum(estimated_bytes) AS bytes
    FROM public.v_retention_metrics_summary m
    WHERE p_empresa_id IS NULL OR m.empresa_id = p_empresa_id
    GROUP BY retention_state
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_by_class
  FROM (
    SELECT asset_class, retention_state, sum(item_count) AS items, sum(estimated_bytes) AS bytes
    FROM public.v_retention_metrics_summary m
    WHERE p_empresa_id IS NULL OR m.empresa_id = p_empresa_id
    GROUP BY asset_class, retention_state
    ORDER BY asset_class, retention_state
  ) t;

  v_result := jsonb_build_object(
    'dry_run', true,
    'purge_enabled', v_purge_enabled,
    'would_delete', false,
    'empresa_id', p_empresa_id,
    'reclaimable_bytes', v_total_borable_bytes,
    'reclaimable_human', pg_size_pretty(v_total_borable_bytes),
    'by_state', v_by_state,
    'by_class', v_by_class,
    'simulated_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'override_days', p_override_days
  );

  INSERT INTO public.retention_simulation_log (empresa_id, run_by, parameters, result)
  VALUES (
    p_empresa_id,
    auth.uid(),
    jsonb_build_object('override_days', p_override_days),
    v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.retention_run_simulation(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retention_run_simulation(uuid, jsonb) TO authenticated;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.retention_framework_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_asset_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_policy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_simulation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rfm_sel ON public.retention_framework_meta;
CREATE POLICY rfm_sel ON public.retention_framework_meta FOR SELECT TO authenticated
  USING (public.is_retention_admin());
DROP POLICY IF EXISTS rfm_all ON public.retention_framework_meta;
CREATE POLICY rfm_all ON public.retention_framework_meta FOR ALL TO authenticated
  USING (public.is_retention_admin()) WITH CHECK (public.is_retention_admin());

DROP POLICY IF EXISTS rac_sel ON public.retention_asset_catalog;
CREATE POLICY rac_sel ON public.retention_asset_catalog FOR SELECT TO authenticated
  USING (public.is_retention_admin());

DROP POLICY IF EXISTS rpc_sel ON public.retention_policy_config;
CREATE POLICY rpc_sel ON public.retention_policy_config FOR SELECT TO authenticated
  USING (public.is_retention_admin());
DROP POLICY IF EXISTS rpc_all ON public.retention_policy_config;
CREATE POLICY rpc_all ON public.retention_policy_config FOR ALL TO authenticated
  USING (public.is_retention_admin()) WITH CHECK (public.is_retention_admin());

DROP POLICY IF EXISTS rsl_sel ON public.retention_simulation_log;
CREATE POLICY rsl_sel ON public.retention_simulation_log FOR SELECT TO authenticated
  USING (public.is_retention_admin());
DROP POLICY IF EXISTS rsl_ins ON public.retention_simulation_log;
CREATE POLICY rsl_ins ON public.retention_simulation_log FOR INSERT TO authenticated
  WITH CHECK (public.is_retention_admin());

GRANT SELECT ON public.v_retention_metrics_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retention_framework_meta TO authenticated;
GRANT SELECT ON public.retention_asset_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retention_policy_config TO authenticated;
GRANT SELECT, INSERT ON public.retention_simulation_log TO authenticated;

COMMENT ON TABLE public.retention_policy_config IS
  'Días de retención por clase de dato. purge_enabled=false: solo simulación.';
COMMENT ON FUNCTION public.retention_run_simulation IS
  'Simula espacio liberable. NO elimina filas ni objetos storage.';

-- <<< END supabase/migrations/20260708120000_data_retention_framework.sql


-- >>> FILE: supabase/migrations/20260709120000_dcdt_master_partes.sql

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

-- <<< END supabase/migrations/20260709120000_dcdt_master_partes.sql


-- >>> FILE: supabase/migrations/20260710120000_dcdt_rename_from_carta_porte.sql

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

-- <<< END supabase/migrations/20260710120000_dcdt_rename_from_carta_porte.sql


-- >>> FILE: supabase/migrations/20260710130000_fix_dcdt_rls_function_volatility.sql

-- =============================================================================
-- DEMO: fix user_can_manage_dcdt_trafico — STABLE + SET LOCAL no permitido (0A000)
-- Recrear como SQL VOLATILE sin SET dentro de la función.
-- Solo owner o jefe_flota/trafico activos (sin administrativo).
-- =============================================================================

DROP FUNCTION IF EXISTS public.user_can_manage_dcdt_trafico(uuid);

CREATE OR REPLACE FUNCTION public.user_can_manage_dcdt_trafico(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.empresas e
    WHERE e.id = p_empresa_id
      AND e.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.rol IN ('jefe_flota', 'trafico')
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) TO authenticated;

-- <<< END supabase/migrations/20260710130000_fix_dcdt_rls_function_volatility.sql


-- >>> FILE: supabase/migrations/20260710140000_empresas_domicilio_dcdt.sql

-- DEMO / prod-safe: domicilio fiscal transportista en empresas (DCDT)
-- Sincronizable desde perfil de empresa; fallback sigue siendo profiles del owner.

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RAISE NOTICE 'empresas: omitido domicilio DCDT';
    RETURN;
  END IF;

  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS direccion text;
  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cp text;
  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS ciudad text;
  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS domicilio_fiscal text;

  COMMENT ON COLUMN public.empresas.direccion IS 'Dirección / domicilio fiscal (DCDT transportista)';
  COMMENT ON COLUMN public.empresas.domicilio_fiscal IS 'Alias domicilio fiscal si difiere de direccion';
END $$;

-- <<< END supabase/migrations/20260710140000_empresas_domicilio_dcdt.sql


-- >>> FILE: supabase/migrations/20260710150000_dcdt_pdf_retention_demo.sql

-- DEMO: retención mínima 365 días para PDF DCDT (servicio_documentos_extra.tipo = dcdt).
-- Alineado con esquema real de retention_asset_catalog / retention_policy_config
-- (migración 20260708120000_data_retention_framework.sql).
-- Ejecutar en Supabase DEMO si el framework de retención ya está aplicado.

INSERT INTO public.retention_asset_catalog (asset_class, label, tier, entity_hint, includes_storage, description)
VALUES (
  'dcdt_pdf',
  'PDF DCDT (documento legal)',
  'RETENIDO',
  'servicio_documentos_extra',
  true,
  'tipo=dcdt · conservación mínima 365 días (retention_until en datos JSON)'
)
ON CONFLICT (asset_class) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  entity_hint = EXCLUDED.entity_hint,
  includes_storage = EXCLUDED.includes_storage,
  description = EXCLUDED.description;

INSERT INTO public.retention_policy_config (
  scope, empresa_id, asset_class,
  days_until_archivable, days_until_borable, min_retention_days, purge_enabled, notes
)
SELECT v.scope, v.empresa_id, v.asset_class, v.da, v.db, v.mn, false, v.notes
FROM (VALUES
  ('global'::text, NULL::uuid, 'dcdt_pdf', 0, 0, 365, 'DCDT legal — mínimo 365 días; purge desactivado')
) AS v(scope, empresa_id, asset_class, da, db, mn, notes)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.retention_policy_config rpc
  WHERE rpc.scope = 'global' AND rpc.asset_class = 'dcdt_pdf'
);

UPDATE public.retention_policy_config
SET
  min_retention_days = GREATEST(min_retention_days, 365),
  notes = COALESCE(notes, 'DCDT legal — mínimo 365 días; purge desactivado'),
  updated_at = now()
WHERE scope = 'global' AND asset_class = 'dcdt_pdf';

-- <<< END supabase/migrations/20260710150000_dcdt_pdf_retention_demo.sql


-- >>> FILE: supabase/migrations/20260712120000_dcdt_deca_public_id_demo.sql

-- DEMO: DeCA — identificador público estable por dcdt_servicio
-- Proyecto: cuaderno-demo-ab.vercel.app · Supabase fezacjtbavgdosncxlzw
-- Ejecutar solo en DEMO:
--   node scripts/apply-sql-file.mjs supabase/migrations/20260712120000_dcdt_deca_public_id_demo.sql
--
-- Semántica deca_public_id:
--   - Estable por fila dcdt_servicio; regeneración PDF in-place mantiene el mismo id → misma URL/QR.
--   - Nuevo uuid solo al emitir documento nuevo (futuro: nueva pdf_dcdt_version / nuevo QR).

ALTER TABLE public.dcdt_servicio
  ADD COLUMN IF NOT EXISTS deca_public_id uuid;

UPDATE public.dcdt_servicio
SET deca_public_id = gen_random_uuid()
WHERE deca_public_id IS NULL;

ALTER TABLE public.dcdt_servicio
  ALTER COLUMN deca_public_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN deca_public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dcdt_servicio_deca_public_id
  ON public.dcdt_servicio (deca_public_id);

COMMENT ON COLUMN public.dcdt_servicio.deca_public_id IS
  'UUID público estable (DeCA). URL canónica: /api/dcdt-download?id={deca_public_id}. '
  'Se conserva al regenerar PDF in-place; nuevo uuid solo en emisión de documento nuevo.';

-- <<< END supabase/migrations/20260712120000_dcdt_deca_public_id_demo.sql


-- >>> FILE: supabase/migrations/20260713120000_conductor_empresa_vehiculo_demo.sql

-- DEMO: matrícula remolque en flota empresa (autorrelleno DCDT art. 6).
-- matricula ya existe en conductor_empresa; remolque se añade aquí.

ALTER TABLE public.conductor_empresa
  ADD COLUMN IF NOT EXISTS remolque text;

COMMENT ON COLUMN public.conductor_empresa.remolque IS
  'Matrícula remolque/semirremolque asignado al conductor en la flota (DCDT art. 6).';

-- <<< END supabase/migrations/20260713120000_conductor_empresa_vehiculo_demo.sql

