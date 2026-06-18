-- Verificación DEMO — Fase 2: varios DeCA + fecha_inicio_efectivo
-- Ejecutar en SQL Editor (fezacjtbavgdosncxlzw) tras desplegar la app con Fase 2.

-- ── A) SERV-115: un solo cargador → un solo DeCA ─────────────────────────────

SELECT
  s.id AS servicio_id,
  coalesce(s.service_number, s.referencia::text) AS label,
  (SELECT count(*)::int FROM public.dcdt_servicio d WHERE d.servicio_id = s.id) AS deca_count,
  public.dcdt_cargador_groups_for_servicio(s.id) -> 'group_count' AS cargador_groups
FROM public.servicios s
WHERE coalesce(s.service_number, '') ILIKE '%115%'
   OR s.referencia::text ILIKE '%115%'
ORDER BY s.created_at DESC
LIMIT 3;

-- Esperado SERV-115: deca_count = 1, cargador_groups = 1

-- ── B) Servicio con 2 cargadores → 2 DeCA con cargador_id correcto ─────────

SELECT
  s.id AS servicio_id,
  coalesce(s.service_number, s.referencia::text) AS label,
  d.id AS dcdt_id,
  d.datos -> 'partes' ->> 'cargador_id' AS cargador_id,
  d.fecha_inicio_efectivo,
  d.created_at
FROM public.servicios s
JOIN public.dcdt_servicio d ON d.servicio_id = s.id
WHERE (
  SELECT count(DISTINCT public.stop_parte_transporte_id(st.notas))
  FROM public.stops st
  WHERE st.servicio_id = s.id
    AND lower(coalesce(st.tipo, '')) = 'carga'
    AND public.stop_parte_transporte_id(st.notas) IS NOT NULL
) >= 2
ORDER BY s.created_at DESC, d.created_at ASC
LIMIT 10;

-- ── C) Vínculo parada → DeCA en notas (__CUADERNO_OP__.dcdt_servicio_id) ───

SELECT
  st.id AS stop_id,
  st.orden,
  st.tipo,
  public.stop_parte_transporte_id(st.notas) AS cargador_parte_id,
  (public.stop_operacion_meta_json(st.notas) ->> 'dcdt_servicio_id')::uuid AS dcdt_servicio_id,
  d.datos -> 'partes' ->> 'cargador_id' AS dcdt_cargador_id
FROM public.stops st
LEFT JOIN public.dcdt_servicio d
  ON d.id = (public.stop_operacion_meta_json(st.notas) ->> 'dcdt_servicio_id')::uuid
WHERE st.servicio_id = (
  SELECT s.id
  FROM public.servicios s
  WHERE (
    SELECT count(DISTINCT public.stop_parte_transporte_id(st2.notas))
    FROM public.stops st2
    WHERE st2.servicio_id = s.id
      AND lower(coalesce(st2.tipo, '')) = 'carga'
      AND public.stop_parte_transporte_id(st2.notas) IS NOT NULL
  ) >= 2
  ORDER BY s.created_at DESC
  LIMIT 1
)
  AND lower(coalesce(st.tipo, '')) IN ('carga', 'descarga')
ORDER BY st.orden;

-- Esperado: cada parada carga con el dcdt cuyo cargador_id coincide;
-- descargas del segmento con el dcdt del cargador precedente en orden.

-- ── D) fecha_inicio_efectivo tras completar 1ª carga ─────────────────────────

SELECT
  d.id,
  d.servicio_id,
  d.datos -> 'partes' ->> 'cargador_id' AS cargador_id,
  d.fecha_inicio_efectivo,
  (
    SELECT min(st.hora_salida_real)
    FROM public.stops st
    WHERE (public.stop_operacion_meta_json(st.notas) ->> 'dcdt_servicio_id')::uuid = d.id
      AND lower(coalesce(st.tipo, '')) = 'carga'
      AND st.estado = 'completado'
  ) AS primera_carga_salida
FROM public.dcdt_servicio d
WHERE d.fecha_inicio_efectivo IS NOT NULL
ORDER BY d.fecha_inicio_efectivo DESC
LIMIT 5;

-- Esperado: fecha_inicio_efectivo ≈ primera_carga_salida del DeCA.

-- ── E) No sobrescribir: DeCA con varias cargas completadas ───────────────────

SELECT
  d.id,
  d.fecha_inicio_efectivo,
  count(*) FILTER (WHERE st.estado = 'completado') AS cargas_completadas,
  min(st.hora_salida_real) AS primera_salida,
  max(st.hora_salida_real) AS ultima_salida
FROM public.dcdt_servicio d
JOIN public.stops st
  ON (public.stop_operacion_meta_json(st.notas) ->> 'dcdt_servicio_id')::uuid = d.id
  AND lower(coalesce(st.tipo, '')) = 'carga'
WHERE d.fecha_inicio_efectivo IS NOT NULL
GROUP BY d.id, d.fecha_inicio_efectivo
HAVING count(*) FILTER (WHERE st.estado = 'completado') >= 2
LIMIT 5;

-- Esperado: fecha_inicio_efectivo = primera_salida (no ultima_salida).
