-- DeCA vivo por servicio — trazabilidad de movimientos y documento único visible.
-- Normativa: Orden FOM/2861/2012, Orden TRM/282/2026, Resolución BOE-A-2026-12784.
-- DEMO: node scripts/apply-sql-file.mjs supabase/migrations/20260728120000_deca_vivo_servicio.sql

-- ── 1) Tablas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deca_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL,
  conductor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  vehiculo_id uuid,
  matricula_tractora text,
  matricula_remolque text,
  cargador_contractual_nombre text,
  cargador_contractual_nif text,
  transportista_efectivo_nombre text,
  transportista_efectivo_nif text,
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'actual', 'cerrado', 'anulado')),
  version integer NOT NULL DEFAULT 1,
  es_visible_conductor boolean NOT NULL DEFAULT false,
  qr_token uuid NOT NULL DEFAULT gen_random_uuid(),
  pdf_url text,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
  cerrado_en timestamptz,
  creado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actualizado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT deca_documentos_qr_token_unique UNIQUE (qr_token)
);

COMMENT ON TABLE public.deca_documentos IS
  'DeCA vivo por servicio. Solo un registro estado=actual y es_visible_conductor=true por servicio.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_deca_documentos_servicio_actual_visible
  ON public.deca_documentos (servicio_id)
  WHERE estado = 'actual' AND es_visible_conductor = true;

CREATE INDEX IF NOT EXISTS idx_deca_documentos_servicio ON public.deca_documentos (servicio_id);
CREATE INDEX IF NOT EXISTS idx_deca_documentos_qr_token ON public.deca_documentos (qr_token);

CREATE TABLE IF NOT EXISTS public.deca_movimientos_carga (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  deca_id uuid REFERENCES public.deca_documentos (id) ON DELETE SET NULL,
  empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL,
  parada_id uuid REFERENCES public.stops (id) ON DELETE SET NULL,
  tipo_movimiento text NOT NULL
    CHECK (tipo_movimiento IN (
      'CARGA', 'DESCARGA', 'CARGA_RETORNO', 'DESCARGA_RETORNO',
      'DEVOLUCION', 'RECOGIDA_ENVASES', 'ENTREGA_ENVASES',
      'AJUSTE_MANUAL', 'INCIDENCIA_MERCANCIA'
    )),
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  lugar_nombre text,
  lugar_direccion text,
  localidad text,
  provincia text,
  origen_nombre text,
  destino_nombre text,
  descripcion_mercancia text NOT NULL,
  categoria_mercancia text,
  cantidad numeric,
  unidad text,
  peso_kg numeric,
  observaciones text,
  documento_referencia text,
  foto_url text,
  firma_url text,
  motivo_ajuste text,
  creado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.deca_movimientos_carga IS
  'Movimientos append-only de carga/descarga/retorno. Base de trazabilidad DeCA vivo.';

CREATE INDEX IF NOT EXISTS idx_deca_movimientos_servicio_fecha
  ON public.deca_movimientos_carga (servicio_id, fecha_hora, created_at);

CREATE TABLE IF NOT EXISTS public.deca_stock_actual_camion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL,
  line_key text NOT NULL,
  descripcion_mercancia text NOT NULL,
  categoria_mercancia text,
  cantidad_actual numeric NOT NULL DEFAULT 0,
  unidad text,
  peso_kg_actual numeric,
  origen_trazable text,
  destino_previsto text,
  ultimo_movimiento_id uuid REFERENCES public.deca_movimientos_carga (id) ON DELETE SET NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deca_stock_servicio_line_unique UNIQUE (servicio_id, line_key)
);

CREATE INDEX IF NOT EXISTS idx_deca_stock_servicio ON public.deca_stock_actual_camion (servicio_id);

CREATE TABLE IF NOT EXISTS public.deca_versiones_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deca_id uuid REFERENCES public.deca_documentos (id) ON DELETE SET NULL,
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot_json jsonb NOT NULL,
  motivo text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  creado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_deca_versiones_servicio
  ON public.deca_versiones_historial (servicio_id, version DESC);

-- ── 2) Acceso RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.deca_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deca_movimientos_carga ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deca_stock_actual_camion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deca_versiones_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY deca_doc_sel ON public.deca_documentos
  FOR SELECT TO authenticated
  USING (
    public.user_can_access_servicio(servicio_id)
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

CREATE POLICY deca_doc_ins ON public.deca_documentos
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY deca_doc_upd ON public.deca_documentos
  FOR UPDATE TO authenticated
  USING (
    public.user_can_manage_dcdt_trafico(empresa_id)
    OR public.user_is_servicio_conductor(servicio_id)
    OR (user_id IS NOT NULL AND user_id = auth.uid())
  );

CREATE POLICY deca_mov_sel ON public.deca_movimientos_carga
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY deca_mov_ins ON public.deca_movimientos_carga
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_manage_dcdt_trafico(empresa_id)
    OR public.user_is_servicio_conductor(servicio_id)
    OR public.servicio_is_autonomo_pro_owned(
      (SELECT s.empresa_id FROM public.servicios s WHERE s.id = servicio_id),
      (SELECT s.conductor_id FROM public.servicios s WHERE s.id = servicio_id)
    )
  );

CREATE POLICY deca_stock_sel ON public.deca_stock_actual_camion
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY deca_ver_sel ON public.deca_versiones_historial
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

GRANT SELECT, INSERT, UPDATE ON public.deca_documentos TO authenticated;
GRANT SELECT, INSERT ON public.deca_movimientos_carga TO authenticated;
GRANT SELECT ON public.deca_stock_actual_camion TO authenticated;
GRANT SELECT ON public.deca_versiones_historial TO authenticated;
GRANT ALL ON public.deca_documentos TO service_role;
GRANT ALL ON public.deca_movimientos_carga TO service_role;
GRANT ALL ON public.deca_stock_actual_camion TO service_role;
GRANT ALL ON public.deca_versiones_historial TO service_role;

-- ── 3) Helpers internos ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deca_movimiento_es_suma(p_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(p_tipo, '')) IN (
    'carga', 'carga_retorno', 'recogida_envases', 'devolucion'
  );
$$;

CREATE OR REPLACE FUNCTION public.deca_movimiento_es_resta(p_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(p_tipo, '')) IN (
    'descarga', 'descarga_retorno', 'entrega_envases'
  );
$$;

CREATE OR REPLACE FUNCTION public.deca_stock_line_key(
  p_desc text,
  p_cat text,
  p_unidad text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(coalesce(p_desc, ''))) || '|'
    || lower(trim(coalesce(p_cat, ''))) || '|'
    || lower(trim(coalesce(p_unidad, '')));
$$;

-- Recalcula stock desde movimientos (append-only).
CREATE OR REPLACE FUNCTION public.deca_recalcular_stock_internal(p_servicio_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_qty numeric;
  v_peso numeric;
  v_key text;
BEGIN
  DELETE FROM public.deca_stock_actual_camion WHERE servicio_id = p_servicio_id;

  FOR r IN
    SELECT *
    FROM public.deca_movimientos_carga m
    WHERE m.servicio_id = p_servicio_id
    ORDER BY m.fecha_hora ASC, m.created_at ASC, m.id ASC
  LOOP
    v_key := public.deca_stock_line_key(
      r.descripcion_mercancia, r.categoria_mercancia, r.unidad
    );

    IF r.tipo_movimiento = 'AJUSTE_MANUAL' THEN
      v_qty := coalesce(r.cantidad, 0);
      v_peso := r.peso_kg;
    ELSIF public.deca_movimiento_es_suma(r.tipo_movimiento) THEN
      v_qty := coalesce(r.cantidad, 0);
      v_peso := coalesce(r.peso_kg, 0);
    ELSIF public.deca_movimiento_es_resta(r.tipo_movimiento) THEN
      v_qty := -coalesce(r.cantidad, 0);
      v_peso := CASE WHEN r.peso_kg IS NULL THEN NULL ELSE -r.peso_kg END;
    ELSE
      CONTINUE;
    END IF;

    INSERT INTO public.deca_stock_actual_camion (
      servicio_id, empresa_id, line_key, descripcion_mercancia, categoria_mercancia,
      cantidad_actual, unidad, peso_kg_actual, origen_trazable, destino_previsto,
      ultimo_movimiento_id, actualizado_en
    )
    VALUES (
      p_servicio_id, r.empresa_id, v_key, r.descripcion_mercancia, r.categoria_mercancia,
      v_qty, r.unidad, v_peso, r.origen_nombre, r.destino_nombre,
      r.id, now()
    )
    ON CONFLICT ON CONSTRAINT deca_stock_servicio_line_unique
    DO UPDATE SET
      cantidad_actual = public.deca_stock_actual_camion.cantidad_actual + EXCLUDED.cantidad_actual,
      peso_kg_actual = CASE
        WHEN EXCLUDED.peso_kg_actual IS NULL THEN public.deca_stock_actual_camion.peso_kg_actual
        WHEN public.deca_stock_actual_camion.peso_kg_actual IS NULL THEN EXCLUDED.peso_kg_actual
        ELSE public.deca_stock_actual_camion.peso_kg_actual + EXCLUDED.peso_kg_actual
      END,
      origen_trazable = coalesce(EXCLUDED.origen_trazable, public.deca_stock_actual_camion.origen_trazable),
      destino_previsto = coalesce(EXCLUDED.destino_previsto, public.deca_stock_actual_camion.destino_previsto),
      ultimo_movimiento_id = EXCLUDED.ultimo_movimiento_id,
      actualizado_en = now();
  END LOOP;

  DELETE FROM public.deca_stock_actual_camion
  WHERE servicio_id = p_servicio_id
    AND coalesce(cantidad_actual, 0) <= 0
    AND (peso_kg_actual IS NULL OR peso_kg_actual <= 0);
END;
$$;

REVOKE ALL ON FUNCTION public.deca_recalcular_stock_internal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deca_recalcular_stock_internal(uuid) TO service_role;

-- ── 4) Regenerar DeCA actual ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recalcular_deca_actual(p_servicio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serv record;
  v_doc record;
  v_new_id uuid;
  v_stock jsonb;
  v_movs jsonb;
  v_snapshot jsonb;
  v_version integer;
  v_uid uuid := auth.uid();
BEGIN
  IF p_servicio_id IS NULL THEN
    RAISE EXCEPTION 'servicio_id requerido';
  END IF;

  IF v_uid IS NOT NULL AND NOT public.user_can_access_servicio(p_servicio_id) THEN
    RAISE EXCEPTION 'sin acceso al servicio' USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_serv FROM public.servicios s WHERE s.id = p_servicio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'servicio no encontrado';
  END IF;

  PERFORM public.deca_recalcular_stock_internal(p_servicio_id);

  SELECT jsonb_agg(to_jsonb(st.*) ORDER BY st.descripcion_mercancia)
  INTO v_stock
  FROM public.deca_stock_actual_camion st
  WHERE st.servicio_id = p_servicio_id;

  SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.fecha_hora DESC, m.created_at DESC)
  INTO v_movs
  FROM (
    SELECT * FROM public.deca_movimientos_carga
    WHERE servicio_id = p_servicio_id
    ORDER BY fecha_hora DESC, created_at DESC
    LIMIT 20
  ) m;

  v_snapshot := jsonb_build_object(
    'servicio_id', p_servicio_id,
    'stock_actual', coalesce(v_stock, '[]'::jsonb),
    'ultimos_movimientos', coalesce(v_movs, '[]'::jsonb),
    'generado_en', now()
  );

  SELECT * INTO v_doc
  FROM public.deca_documentos d
  WHERE d.servicio_id = p_servicio_id
    AND d.estado = 'actual'
    AND d.es_visible_conductor = true
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    INSERT INTO public.deca_versiones_historial (deca_id, servicio_id, version, snapshot_json, motivo, creado_por)
    VALUES (v_doc.id, p_servicio_id, v_doc.version, v_doc.snapshot_json, 'actualización automática', v_uid);

    v_version := v_doc.version + 1;

    UPDATE public.deca_documentos
    SET
      version = v_version,
      snapshot_json = v_snapshot,
      fecha_actualizacion = now(),
      actualizado_por = v_uid,
      estado = 'actual',
      es_visible_conductor = true
    WHERE id = v_doc.id
    RETURNING id INTO v_new_id;
  ELSE
    INSERT INTO public.deca_documentos (
      servicio_id, empresa_id, conductor_id,
      matricula_tractora, matricula_remolque,
      estado, version, es_visible_conductor, snapshot_json,
      user_id, creado_por, actualizado_por
    )
    VALUES (
      p_servicio_id, v_serv.empresa_id, v_serv.conductor_id,
      v_serv.matricula, NULL,
      'actual', 1, true, v_snapshot,
      CASE WHEN v_serv.empresa_id IS NULL THEN v_serv.conductor_id ELSE NULL END,
      v_uid, v_uid
    )
    RETURNING id INTO v_new_id;
  END IF;

  UPDATE public.deca_movimientos_carga
  SET deca_id = v_new_id
  WHERE servicio_id = p_servicio_id AND deca_id IS NULL;

  RETURN public.obtener_deca_actual_visible(p_servicio_id);
END;
$$;

REVOKE ALL ON FUNCTION public.recalcular_deca_actual(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalcular_deca_actual(uuid) TO authenticated, service_role;

-- ── 5) Registrar movimiento ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_movimiento_carga(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_servicio_id uuid;
  v_empresa_id uuid;
  v_tipo text;
  v_desc text;
  v_qty numeric;
  v_unidad text;
  v_peso numeric;
  v_stock_qty numeric;
  v_mov_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  v_servicio_id := (p_payload->>'servicio_id')::uuid;
  v_tipo := upper(trim(coalesce(p_payload->>'tipo_movimiento', '')));
  v_desc := trim(coalesce(p_payload->>'descripcion_mercancia', ''));

  IF v_servicio_id IS NULL THEN
    RAISE EXCEPTION 'servicio_id requerido';
  END IF;
  IF v_desc = '' THEN
    RAISE EXCEPTION 'descripcion_mercancia obligatoria';
  END IF;
  IF v_tipo = '' THEN
    RAISE EXCEPTION 'tipo_movimiento obligatorio';
  END IF;

  IF v_uid IS NOT NULL AND NOT public.user_can_access_servicio(v_servicio_id) THEN
    RAISE EXCEPTION 'sin acceso al servicio' USING ERRCODE = '42501';
  END IF;

  SELECT s.empresa_id INTO v_empresa_id FROM public.servicios s WHERE s.id = v_servicio_id;

  v_qty := NULLIF(trim(coalesce(p_payload->>'cantidad', '')), '')::numeric;
  v_unidad := NULLIF(trim(p_payload->>'unidad'), '');
  v_peso := NULLIF(trim(coalesce(p_payload->>'peso_kg', '')), '')::numeric;

  IF v_peso IS NULL AND (v_qty IS NULL OR v_unidad IS NULL OR v_unidad = '') THEN
    RAISE EXCEPTION 'indique peso_kg o cantidad con unidad';
  END IF;

  IF v_tipo = 'AJUSTE_MANUAL' AND coalesce(trim(p_payload->>'motivo_ajuste'), '') = '' THEN
    RAISE EXCEPTION 'motivo_ajuste obligatorio para ajuste manual';
  END IF;

  IF public.deca_movimiento_es_resta(v_tipo) AND v_tipo <> 'AJUSTE_MANUAL' THEN
    SELECT coalesce(sum(cantidad_actual), 0) INTO v_stock_qty
    FROM public.deca_stock_actual_camion
    WHERE servicio_id = v_servicio_id
      AND lower(trim(descripcion_mercancia)) = lower(v_desc)
      AND coalesce(lower(trim(categoria_mercancia)), '') = coalesce(lower(trim(p_payload->>'categoria_mercancia')), '')
      AND coalesce(lower(trim(unidad)), '') = coalesce(lower(trim(v_unidad)), '');

    IF v_qty IS NOT NULL AND v_qty > coalesce(v_stock_qty, 0) THEN
      RAISE EXCEPTION 'cantidad a descargar (%) supera stock (%). Use AJUSTE_MANUAL.', v_qty, v_stock_qty;
    END IF;
  END IF;

  INSERT INTO public.deca_movimientos_carga (
    servicio_id, empresa_id, parada_id, tipo_movimiento, fecha_hora,
    lugar_nombre, lugar_direccion, localidad, provincia,
    origen_nombre, destino_nombre, descripcion_mercancia, categoria_mercancia,
    cantidad, unidad, peso_kg, observaciones, documento_referencia,
    foto_url, firma_url, motivo_ajuste, creado_por
  )
  VALUES (
    v_servicio_id, v_empresa_id,
    NULLIF(trim(p_payload->>'parada_id'), '')::uuid,
    v_tipo,
    coalesce((p_payload->>'fecha_hora')::timestamptz, now()),
    NULLIF(trim(p_payload->>'lugar_nombre'), ''),
    NULLIF(trim(p_payload->>'lugar_direccion'), ''),
    NULLIF(trim(p_payload->>'localidad'), ''),
    NULLIF(trim(p_payload->>'provincia'), ''),
    NULLIF(trim(p_payload->>'origen_nombre'), ''),
    NULLIF(trim(p_payload->>'destino_nombre'), ''),
    v_desc,
    NULLIF(trim(p_payload->>'categoria_mercancia'), ''),
    v_qty, v_unidad, v_peso,
    NULLIF(trim(p_payload->>'observaciones'), ''),
    NULLIF(trim(p_payload->>'documento_referencia'), ''),
    NULLIF(trim(p_payload->>'foto_url'), ''),
    NULLIF(trim(p_payload->>'firma_url'), ''),
    NULLIF(trim(p_payload->>'motivo_ajuste'), ''),
    v_uid
  )
  RETURNING id INTO v_mov_id;

  RETURN public.recalcular_deca_actual(v_servicio_id);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimiento_carga(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_carga(jsonb) TO authenticated, service_role;

-- ── 6) Consultas ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.obtener_deca_actual_visible(p_servicio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc record;
  v_stock jsonb;
  v_movs jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF p_servicio_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_uid IS NOT NULL AND NOT public.user_can_access_servicio(p_servicio_id) THEN
    RAISE EXCEPTION 'sin acceso al servicio' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_doc
  FROM public.deca_documentos d
  WHERE d.servicio_id = p_servicio_id
    AND d.estado = 'actual'
    AND d.es_visible_conductor = true
  ORDER BY d.fecha_actualizacion DESC
  LIMIT 1;

  SELECT coalesce(jsonb_agg(to_jsonb(st.*) ORDER BY st.descripcion_mercancia), '[]'::jsonb)
  INTO v_stock
  FROM public.deca_stock_actual_camion st
  WHERE st.servicio_id = p_servicio_id;

  SELECT coalesce(jsonb_agg(to_jsonb(m.*) ORDER BY m.fecha_hora DESC, m.created_at DESC), '[]'::jsonb)
  INTO v_movs
  FROM (
    SELECT * FROM public.deca_movimientos_carga
    WHERE servicio_id = p_servicio_id
    ORDER BY fecha_hora DESC, created_at DESC
    LIMIT 30
  ) m;

  IF v_doc.id IS NULL THEN
    RETURN jsonb_build_object(
      'servicio_id', p_servicio_id,
      'documento', NULL,
      'stock_actual', v_stock,
      'ultimos_movimientos', v_movs
    );
  END IF;

  RETURN jsonb_build_object(
    'servicio_id', p_servicio_id,
    'documento', to_jsonb(v_doc),
    'stock_actual', v_stock,
    'ultimos_movimientos', v_movs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_deca_actual_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_deca_actual_visible(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.generar_qr_deca_actual(p_servicio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc record;
  v_token uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL AND NOT public.user_can_access_servicio(p_servicio_id) THEN
    RAISE EXCEPTION 'sin acceso al servicio' USING ERRCODE = '42501';
  END IF;

  PERFORM public.recalcular_deca_actual(p_servicio_id);

  SELECT * INTO v_doc
  FROM public.deca_documentos
  WHERE servicio_id = p_servicio_id AND estado = 'actual' AND es_visible_conductor = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no hay DeCA actual para el servicio';
  END IF;

  v_token := gen_random_uuid();

  UPDATE public.deca_documentos
  SET qr_token = v_token, fecha_actualizacion = now(), actualizado_por = v_uid
  WHERE id = v_doc.id;

  RETURN jsonb_build_object(
    'servicio_id', p_servicio_id,
    'deca_id', v_doc.id,
    'qr_token', v_token,
    'version', v_doc.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generar_qr_deca_actual(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generar_qr_deca_actual(uuid) TO authenticated, service_role;

-- Vista pública inspección (service_role / API)
CREATE OR REPLACE FUNCTION public.obtener_deca_inspeccion_por_token(p_qr_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc record;
BEGIN
  SELECT * INTO v_doc
  FROM public.deca_documentos d
  WHERE d.qr_token = p_qr_token
    AND d.estado = 'actual'
    AND d.es_visible_conductor = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'referencia_normativa', 'Orden FOM/2861/2012 · Orden TRM/282/2026 · BOE-A-2026-12784',
    'version', v_doc.version,
    'fecha_actualizacion', v_doc.fecha_actualizacion,
    'matricula_tractora', v_doc.matricula_tractora,
    'matricula_remolque', v_doc.matricula_remolque,
    'cargador_contractual_nombre', v_doc.cargador_contractual_nombre,
    'transportista_efectivo_nombre', v_doc.transportista_efectivo_nombre,
    'stock_actual', v_doc.snapshot_json->'stock_actual',
    'nota', 'Documento generado a partir de la trazabilidad operativa del servicio.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_deca_inspeccion_por_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_deca_inspeccion_por_token(uuid) TO service_role;
