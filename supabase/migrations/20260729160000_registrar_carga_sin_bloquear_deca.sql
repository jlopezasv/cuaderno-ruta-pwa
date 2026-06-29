-- URGENTE: registrar carga sin bloquear por matrícula ni fallo DeCA.
-- FASE A: insertar_movimiento_carga (movimiento + stock)
-- FASE B: recalcular_deca_actual (opcional, no rompe FASE A)
-- DEMO: npm run deploy:demo:registrar-carga-fix

-- ── Matrícula: servicios no tiene columna matricula ─────────────────────────

CREATE OR REPLACE FUNCTION public.servicio_operacion_meta_json(p_referencia text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_pos int;
  v_json text;
BEGIN
  IF p_referencia IS NULL OR btrim(p_referencia) = '' THEN
    RETURN '{}'::jsonb;
  END IF;
  IF left(btrim(p_referencia), 1) = '{' THEN
    BEGIN
      RETURN p_referencia::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN '{}'::jsonb;
    END;
  END IF;
  v_pos := position('__SRV_OP__:' in p_referencia);
  IF v_pos = 0 THEN
    RETURN '{}'::jsonb;
  END IF;
  v_json := btrim(substring(p_referencia from v_pos + length('__SRV_OP__:')));
  BEGIN
    RETURN v_json::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::jsonb;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.deca_resolve_matriculas_servicio(p_servicio_id uuid)
RETURNS TABLE(matricula_tractora text, matricula_remolque text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serv_id uuid;
  v_empresa_id uuid;
  v_conductor_id uuid;
  v_referencia text;
  v_meta jsonb;
  v_tractora text;
  v_remolque text;
BEGIN
  matricula_tractora := NULL;
  matricula_remolque := NULL;

  SELECT s.id, s.empresa_id, s.conductor_id, s.referencia::text
  INTO v_serv_id, v_empresa_id, v_conductor_id, v_referencia
  FROM public.servicios s
  WHERE s.id = p_servicio_id;

  IF v_serv_id IS NULL THEN
    RETURN;
  END IF;

  v_meta := public.servicio_operacion_meta_json(v_referencia);
  v_tractora := NULLIF(btrim(coalesce(v_meta->>'matricula', v_meta->>'matricula_tractora', '')), '');
  v_remolque := NULLIF(btrim(coalesce(v_meta->>'remolque', v_meta->>'matricula_remolque', '')), '');

  IF v_tractora IS NULL AND v_empresa_id IS NOT NULL AND v_conductor_id IS NOT NULL THEN
    SELECT NULLIF(btrim(ce.matricula), ''), NULLIF(btrim(ce.remolque), '')
    INTO v_tractora, v_remolque
    FROM public.conductor_empresa ce
    WHERE ce.empresa_id = v_empresa_id
      AND ce.user_id = v_conductor_id
      AND ce.activo IS DISTINCT FROM false
    ORDER BY ce.updated_at DESC NULLS LAST, ce.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  matricula_tractora := v_tractora;
  matricula_remolque := v_remolque;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalcular_deca_actual(p_servicio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_conductor_id uuid;
  v_doc record;
  v_new_id uuid;
  v_stock jsonb;
  v_movs jsonb;
  v_snapshot jsonb;
  v_version integer;
  v_uid uuid := auth.uid();
  v_matricula_tractora text;
  v_matricula_remolque text;
BEGIN
  IF p_servicio_id IS NULL THEN
    RAISE EXCEPTION 'servicio_id requerido';
  END IF;

  IF v_uid IS NOT NULL AND NOT public.user_can_access_servicio(p_servicio_id) THEN
    RAISE EXCEPTION 'sin acceso al servicio' USING ERRCODE = '42501';
  END IF;

  SELECT s.empresa_id, s.conductor_id
  INTO v_empresa_id, v_conductor_id
  FROM public.servicios s
  WHERE s.id = p_servicio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'servicio no encontrado';
  END IF;

  SELECT m.matricula_tractora, m.matricula_remolque
  INTO v_matricula_tractora, v_matricula_remolque
  FROM public.deca_resolve_matriculas_servicio(p_servicio_id) m;

  PERFORM public.deca_recalcular_stock_internal(p_servicio_id);

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
    LIMIT 20
  ) m;

  v_snapshot := jsonb_build_object(
    'servicio_id', p_servicio_id,
    'stock_actual', v_stock,
    'ultimos_movimientos', v_movs,
    'matricula_tractora', v_matricula_tractora,
    'matricula_remolque', v_matricula_remolque,
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
      matricula_tractora = coalesce(v_matricula_tractora, matricula_tractora),
      matricula_remolque = coalesce(v_matricula_remolque, matricula_remolque),
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
      p_servicio_id, v_empresa_id, v_conductor_id,
      v_matricula_tractora, v_matricula_remolque,
      'actual', 1, true, v_snapshot,
      CASE WHEN v_empresa_id IS NULL THEN v_conductor_id ELSE NULL END,
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

-- ── FASE A: solo movimiento + inventario a bordo ─────────────────────────────

CREATE OR REPLACE FUNCTION public.insertar_movimiento_carga(p_payload jsonb)
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
  v_stock jsonb;
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

  PERFORM public.deca_recalcular_stock_internal(v_servicio_id);

  SELECT coalesce(jsonb_agg(to_jsonb(st.*) ORDER BY st.descripcion_mercancia), '[]'::jsonb)
  INTO v_stock
  FROM public.deca_stock_actual_camion st
  WHERE st.servicio_id = v_servicio_id;

  RETURN jsonb_build_object(
    'ok', true,
    'movimiento_id', v_mov_id,
    'servicio_id', v_servicio_id,
    'stock_actual', v_stock
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insertar_movimiento_carga(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insertar_movimiento_carga(jsonb) TO authenticated, service_role;

-- ── FASE A + B: DeCA opcional ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_movimiento_carga(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_servicio_id uuid;
  v_base jsonb;
BEGIN
  v_base := public.insertar_movimiento_carga(p_payload);
  v_servicio_id := (p_payload->>'servicio_id')::uuid;

  BEGIN
    RETURN public.recalcular_deca_actual(v_servicio_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'DeCA pendiente tras movimiento %: %', v_base->>'movimiento_id', SQLERRM;
    RETURN coalesce(public.obtener_deca_actual_visible(v_servicio_id), '{}'::jsonb)
      || jsonb_build_object(
        'deca_pending', true,
        'movimiento_id', v_base->>'movimiento_id',
        'stock_actual', coalesce(v_base->'stock_actual', '[]'::jsonb)
      );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimiento_carga(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_carga(jsonb) TO authenticated, service_role;
