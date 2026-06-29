-- Fix: servicios no tiene columna matricula — resolver desde meta referencia o conductor_empresa.
-- DEMO: npm run deploy:demo:deca-matricula-fix

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
  v_serv record;
  v_meta jsonb;
  v_tractora text;
  v_remolque text;
BEGIN
  matricula_tractora := NULL;
  matricula_remolque := NULL;

  SELECT s.* INTO v_serv FROM public.servicios s WHERE s.id = p_servicio_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_meta := public.servicio_operacion_meta_json(v_serv.referencia::text);
  v_tractora := NULLIF(
    btrim(coalesce(v_meta->>'matricula', v_meta->>'matricula_tractora', '')),
    ''
  );
  v_remolque := NULLIF(
    btrim(coalesce(v_meta->>'remolque', v_meta->>'matricula_remolque', '')),
    ''
  );

  IF v_tractora IS NULL AND v_serv.empresa_id IS NOT NULL AND v_serv.conductor_id IS NOT NULL THEN
    SELECT NULLIF(btrim(ce.matricula), ''), NULLIF(btrim(ce.remolque), '')
    INTO v_tractora, v_remolque
    FROM public.conductor_empresa ce
    WHERE ce.empresa_id = v_serv.empresa_id
      AND ce.user_id = v_serv.conductor_id
      AND ce.activo IS DISTINCT FROM false
    ORDER BY ce.updated_at DESC NULLS LAST, ce.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  matricula_tractora := v_tractora;
  matricula_remolque := v_remolque;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.servicio_operacion_meta_json(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.servicio_operacion_meta_json(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.deca_resolve_matriculas_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deca_resolve_matriculas_servicio(uuid) TO authenticated, service_role;

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
  v_matricula_tractora text;
  v_matricula_remolque text;
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

  SELECT m.matricula_tractora, m.matricula_remolque
  INTO v_matricula_tractora, v_matricula_remolque
  FROM public.deca_resolve_matriculas_servicio(p_servicio_id) m;

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
      p_servicio_id, v_serv.empresa_id, v_serv.conductor_id,
      v_matricula_tractora, v_matricula_remolque,
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
