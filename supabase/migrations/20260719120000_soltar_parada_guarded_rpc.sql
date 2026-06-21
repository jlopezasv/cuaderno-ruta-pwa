-- Validación atómica por parada al soltar / finalizar participación (multi-conductor).
-- Replica conductorSeesStop + otherConductorsWhoSeeStop con FOR UPDATE anti-carrera.

-- ---------------------------------------------------------------------------
-- Helpers internos (no expuestos vía PostgREST)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stop_operational_group_internal(p_tipo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_tipo, '')) = 'carga' THEN 'carga'
    WHEN lower(coalesce(p_tipo, '')) = 'descarga' THEN 'descarga'
    WHEN lower(coalesce(p_tipo, '')) LIKE '%carga%'
      AND lower(coalesce(p_tipo, '')) LIKE '%descarga%' THEN 'carga_descarga'
    ELSE 'otra'
  END;
$$;

CREATE OR REPLACE FUNCTION public.stop_matches_participacion_tipo_internal(
  p_stop_tipo text,
  p_participacion_tipo text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_scope text;
  v_group text;
BEGIN
  v_scope := lower(coalesce(p_participacion_tipo, 'todo'));
  IF v_scope NOT IN ('solo_cargas', 'solo_descargas') THEN
    RETURN true;
  END IF;

  v_group := public.stop_operational_group_internal(p_stop_tipo);

  IF v_scope = 'solo_cargas' THEN
    RETURN v_group IN ('carga', 'carga_descarga');
  END IF;

  IF v_scope = 'solo_descargas' THEN
    RETURN v_group IN ('descarga', 'carga_descarga');
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.participacion_tipo_for_conductor_internal(
  p_servicio_id uuid,
  p_conductor_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT sa.participacion_tipo
      FROM public.servicio_asignaciones sa
      WHERE sa.servicio_id = p_servicio_id
        AND sa.conductor_id = p_conductor_id
        AND sa.stop_id IS NULL
        AND sa.participacion_tipo IS NOT NULL
      ORDER BY sa.created_at DESC
      LIMIT 1
    ),
    'todo'
  );
$$;

CREATE OR REPLACE FUNCTION public.pending_stop_display_label_internal(
  p_servicio_id uuid,
  p_stop_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH typed AS (
    SELECT
      s.id,
      trim(coalesce(s.nombre, s.direccion, '')) AS place,
      public.stop_operational_group_internal(s.tipo) AS type_group,
      s.orden,
      s.tipo
    FROM public.stops s
    WHERE s.servicio_id = p_servicio_id
  ),
  numbered AS (
    SELECT
      id,
      place,
      type_group,
      row_number() OVER (
        PARTITION BY type_group
        ORDER BY orden NULLS LAST, id
      ) AS type_ord
    FROM typed
  ),
  target AS (
    SELECT * FROM numbered WHERE id = p_stop_id
  )
  SELECT coalesce(
    CASE
      WHEN t.place <> '' THEN
        CASE t.type_group
          WHEN 'carga' THEN 'Carga ' || t.type_ord || ' · ' || t.place
          WHEN 'descarga' THEN 'Descarga ' || t.type_ord || ' · ' || t.place
          WHEN 'carga_descarga' THEN 'Carga/descarga ' || t.type_ord || ' · ' || t.place
          ELSE 'Parada ' || t.type_ord::text || ' · ' || t.place
        END
      ELSE
        CASE t.type_group
          WHEN 'carga' THEN 'Carga ' || t.type_ord
          WHEN 'descarga' THEN 'Descarga ' || t.type_ord
          WHEN 'carga_descarga' THEN 'Carga/descarga ' || t.type_ord
          ELSE 'Parada ' || t.type_ord::text
        END
    END,
    'Parada'
  )
  FROM target t;
$$;

CREATE OR REPLACE FUNCTION public.count_other_conductors_seeing_stop_internal(
  p_servicio_id uuid,
  p_excluding_conductor_id uuid,
  p_stop_id uuid,
  p_apply_participacion_tipo_filter boolean
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH servicio_row AS (
    SELECT conductor_id AS principal_id
    FROM public.servicios
    WHERE id = p_servicio_id
  ),
  whole_finalized AS (
    SELECT DISTINCT sa.conductor_id
    FROM public.servicio_asignaciones sa
    WHERE sa.servicio_id = p_servicio_id
      AND sa.stop_id IS NULL
      AND lower(sa.estado_participacion) = 'finalizado'
  ),
  pool AS (
    SELECT DISTINCT conductor_id
    FROM (
      SELECT sr.principal_id AS conductor_id
      FROM servicio_row sr
      WHERE sr.principal_id IS NOT NULL
      UNION ALL
      SELECT sa.conductor_id
      FROM public.servicio_asignaciones sa
      WHERE sa.servicio_id = p_servicio_id
    ) sub
    WHERE conductor_id IS NOT NULL
  ),
  active_conductors AS (
    SELECT p.conductor_id
    FROM pool p
    WHERE NOT EXISTS (
      SELECT 1
      FROM whole_finalized wf
      WHERE wf.conductor_id = p.conductor_id
    )
  ),
  stop_row AS (
    SELECT s.id, s.tipo
    FROM public.stops s
    WHERE s.id = p_stop_id
      AND s.servicio_id = p_servicio_id
  ),
  dropped AS (
    SELECT sa.conductor_id, sa.stop_id
    FROM public.servicio_asignaciones sa
    WHERE sa.servicio_id = p_servicio_id
      AND sa.stop_id IS NOT NULL
      AND lower(sa.estado_participacion) = 'finalizado'
  )
  SELECT count(*)::integer
  FROM active_conductors ac
  CROSS JOIN stop_row sr
  WHERE ac.conductor_id IS DISTINCT FROM p_excluding_conductor_id
    AND NOT EXISTS (
      SELECT 1
      FROM dropped d
      WHERE d.conductor_id = ac.conductor_id
        AND d.stop_id = p_stop_id
    )
    AND (
      NOT coalesce(p_apply_participacion_tipo_filter, false)
      OR public.stop_matches_participacion_tipo_internal(
        sr.tipo,
        public.participacion_tipo_for_conductor_internal(p_servicio_id, ac.conductor_id)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.stop_operational_group_internal(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stop_matches_participacion_tipo_internal(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participacion_tipo_for_conductor_internal(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pending_stop_display_label_internal(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_other_conductors_seeing_stop_internal(uuid, uuid, uuid, boolean) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- RPC: soltar una parada (exclusión personal + anti-huérfana)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soltar_parada_conductor_guarded(
  p_servicio_id uuid,
  p_conductor_id uuid,
  p_stop_id uuid,
  p_apply_participacion_tipo_filter boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_covering integer;
  v_stop record;
  v_already_dropped boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_conductor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT public.user_can_access_servicio(p_servicio_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  PERFORM s.id
  FROM public.servicios s
  WHERE s.id = p_servicio_id
  FOR UPDATE;

  PERFORM sa.id
  FROM public.servicio_asignaciones sa
  WHERE sa.servicio_id = p_servicio_id
  FOR UPDATE;

  SELECT s.id, s.tipo, s.estado, s.hora_salida_real
  INTO v_stop
  FROM public.stops s
  WHERE s.id = p_stop_id
    AND s.servicio_id = p_servicio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parada no encontrada';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.servicio_asignaciones sa
    WHERE sa.servicio_id = p_servicio_id
      AND sa.conductor_id = p_conductor_id
      AND sa.stop_id = p_stop_id
      AND lower(sa.estado_participacion) = 'finalizado'
  )
  INTO v_already_dropped;

  IF v_already_dropped THEN
    RETURN;
  END IF;

  IF v_stop.hora_salida_real IS NULL
     AND lower(coalesce(v_stop.estado, '')) <> 'completado' THEN
    v_covering := public.count_other_conductors_seeing_stop_internal(
      p_servicio_id,
      p_conductor_id,
      p_stop_id,
      p_apply_participacion_tipo_filter
    );

    IF v_covering = 0 THEN
      RAISE EXCEPTION
        'No puedes soltar esta parada: nadie más quedaría asignado a ella. Pide a tráfico que asigne otro conductor primero, o complétala tú mismo.';
    END IF;
  END IF;

  UPDATE public.servicio_asignaciones
  SET
    estado_participacion = 'finalizado',
    fecha_fin_participacion = v_now,
    tipo_asignacion = 'parada_renunciada'
  WHERE servicio_id = p_servicio_id
    AND conductor_id = p_conductor_id
    AND stop_id = p_stop_id;

  IF NOT FOUND THEN
    INSERT INTO public.servicio_asignaciones (
      servicio_id,
      conductor_id,
      stop_id,
      tipo_asignacion,
      estado_participacion,
      fecha_fin_participacion
    )
    VALUES (
      p_servicio_id,
      p_conductor_id,
      p_stop_id,
      'parada_renunciada',
      'finalizado',
      v_now
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.soltar_parada_conductor_guarded(uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soltar_parada_conductor_guarded(uuid, uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.soltar_parada_conductor_guarded(uuid, uuid, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.soltar_parada_conductor_guarded(uuid, uuid, uuid, boolean) IS
  'Exclusión personal de parada con validación anti-huérfana atómica (FOR UPDATE).';

-- ---------------------------------------------------------------------------
-- RPC: finalizar participación completa (valida cada parada pendiente visible)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalizar_participacion_conductor_guarded(
  p_servicio_id uuid,
  p_conductor_id uuid,
  p_apply_participacion_tipo_filter boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_covering integer;
  v_label text;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_conductor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT public.user_can_access_servicio(p_servicio_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  PERFORM s.id
  FROM public.servicios s
  WHERE s.id = p_servicio_id
  FOR UPDATE;

  PERFORM sa.id
  FROM public.servicio_asignaciones sa
  WHERE sa.servicio_id = p_servicio_id
  FOR UPDATE;

  FOR r IN
    SELECT
      s.id,
      s.tipo,
      s.estado,
      s.hora_salida_real,
      s.nombre,
      s.direccion,
      s.orden
    FROM public.stops s
    WHERE s.servicio_id = p_servicio_id
      AND s.hora_salida_real IS NULL
      AND lower(coalesce(s.estado, '')) <> 'completado'
      AND NOT EXISTS (
        SELECT 1
        FROM public.servicio_asignaciones sa
        WHERE sa.servicio_id = p_servicio_id
          AND sa.conductor_id = p_conductor_id
          AND sa.stop_id = s.id
          AND lower(sa.estado_participacion) = 'finalizado'
      )
      AND (
        NOT coalesce(p_apply_participacion_tipo_filter, false)
        OR public.stop_matches_participacion_tipo_internal(
          s.tipo,
          public.participacion_tipo_for_conductor_internal(p_servicio_id, p_conductor_id)
        )
      )
    ORDER BY s.orden NULLS LAST, s.id
  LOOP
    v_covering := public.count_other_conductors_seeing_stop_internal(
      p_servicio_id,
      p_conductor_id,
      r.id,
      p_apply_participacion_tipo_filter
    );

    IF v_covering = 0 THEN
      v_label := coalesce(
        public.pending_stop_display_label_internal(p_servicio_id, r.id),
        'Parada'
      );
      RAISE EXCEPTION
        'No puedes finalizar tu participación: % quedaría sin nadie asignado. Pide a tráfico que asigne otro conductor primero, o complétala tú mismo.',
        v_label;
    END IF;
  END LOOP;

  UPDATE public.servicio_asignaciones
  SET
    estado_participacion = 'finalizado',
    fecha_fin_participacion = v_now
  WHERE servicio_id = p_servicio_id
    AND conductor_id = p_conductor_id;

  IF NOT FOUND THEN
    INSERT INTO public.servicio_asignaciones (
      servicio_id,
      conductor_id,
      stop_id,
      tipo_asignacion,
      estado_participacion,
      fecha_fin_participacion
    )
    VALUES (
      p_servicio_id,
      p_conductor_id,
      NULL,
      'colaborador',
      'finalizado',
      v_now
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_participacion_conductor_guarded(uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalizar_participacion_conductor_guarded(uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalizar_participacion_conductor_guarded(uuid, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.finalizar_participacion_conductor_guarded(uuid, uuid, boolean) IS
  'Finaliza participación del conductor validando que ninguna parada pendiente visible quede huérfana.';
