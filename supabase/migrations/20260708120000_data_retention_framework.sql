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
