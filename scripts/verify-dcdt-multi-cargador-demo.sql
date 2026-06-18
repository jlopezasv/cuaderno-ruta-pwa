-- Verificación DEMO — DeCA múltiple por cargador (Paso 1 esquema)
-- Proyecto Supabase: fezacjtbavgdosncxlzw
-- Ejecutar en SQL Editor tras aplicar:
--   20260718120000_dcdt_multi_deca_cargador_stops_demo.sql

\set ON_ERROR_STOP on

-- ── A) Esquema ───────────────────────────────────────────────────────────────

SELECT
  'dcdt_servicio.servicio_id UNIQUE' AS check_name,
  NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'dcdt_servicio'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%servicio_id%'
  ) AS ok;

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dcdt_servicio'
  AND column_name IN ('servicio_id', 'fecha_inicio_efectivo')
ORDER BY column_name;

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'stops'
  AND column_name IN ('estado', 'completada_at', 'completada_por', 'orden')
ORDER BY column_name;

-- ── B) Insertar 2 DeCA para el mismo servicio (debe permitirse) ───────────────

DO $$
DECLARE
  v_servicio_id uuid;
  v_empresa_id uuid;
BEGIN
  SELECT s.id, s.empresa_id
  INTO v_servicio_id, v_empresa_id
  FROM public.servicios s
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_servicio_id IS NULL THEN
    RAISE NOTICE 'SKIP: no hay servicios en demo';
    RETURN;
  END IF;

  INSERT INTO public.dcdt_servicio (servicio_id, empresa_id, estado, datos)
  VALUES
    (
      v_servicio_id,
      v_empresa_id,
      'borrador',
      jsonb_build_object('partes', jsonb_build_object('cargador_id', gen_random_uuid()))
    ),
    (
      v_servicio_id,
      v_empresa_id,
      'borrador',
      jsonb_build_object('partes', jsonb_build_object('cargador_id', gen_random_uuid()))
    );

  RAISE NOTICE 'OK: insertados 2 dcdt_servicio para servicio %', v_servicio_id;

  DELETE FROM public.dcdt_servicio d
  WHERE d.servicio_id = v_servicio_id
    AND d.created_at >= now() - interval '5 seconds';
END $$;

-- ── C) Servicios candidatos con ≥2 cargadores distintos en paradas carga ─────

SELECT
  s.id AS servicio_id,
  coalesce(s.service_number, s.referencia::text, s.id::text) AS label,
  count(DISTINCT public.stop_parte_transporte_id(st.notas)) AS cargadores_distintos
FROM public.servicios s
JOIN public.stops st ON st.servicio_id = s.id
WHERE lower(coalesce(st.tipo, '')) = 'carga'
  AND public.stop_parte_transporte_id(st.notas) IS NOT NULL
GROUP BY s.id, s.service_number, s.referencia
HAVING count(DISTINCT public.stop_parte_transporte_id(st.notas)) >= 2
ORDER BY s.created_at DESC
LIMIT 5;

-- Sustituye el UUID por uno de la consulta anterior (o SERV-115):
-- SELECT public.dcdt_cargador_groups_for_servicio('PEGAR_SERVICIO_ID_AQUI');

-- Ejemplo con el servicio más reciente que tenga ≥2 cargadores:
SELECT public.dcdt_cargador_groups_for_servicio(sub.servicio_id) AS groups_json
FROM (
  SELECT s.id AS servicio_id
  FROM public.servicios s
  JOIN public.stops st ON st.servicio_id = s.id
  WHERE lower(coalesce(st.tipo, '')) = 'carga'
    AND public.stop_parte_transporte_id(st.notas) IS NOT NULL
  GROUP BY s.id
  HAVING count(DISTINCT public.stop_parte_transporte_id(st.notas)) >= 2
  ORDER BY max(s.created_at) DESC
  LIMIT 1
) sub;
