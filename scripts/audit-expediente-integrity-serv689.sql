-- Desglose integrityRecords para SERV-689 (replica buildServiceExpediente)
-- Ejecutar en SQL Editor DEMO (postgres / service_role)

\set servicio_id '7d535004-e609-43ac-9292-5effd2766988'

-- 0) Contexto
SELECT id, referencia, estado, conductor_id, fecha_inicio, notas
FROM servicios WHERE id = :'servicio_id';

-- 1) Ventana temporal (como serviceWindow en JS)
WITH svc AS (
  SELECT s.*, COALESCE(s.notas::jsonb, '{}'::jsonb) AS notas_j
  FROM servicios s WHERE s.id = :'servicio_id'
),
st AS (
  SELECT * FROM stops WHERE servicio_id = :'servicio_id'
),
ev AS (
  SELECT e.*
  FROM evidencias e
  JOIN st ON st.id = e.stop_id
  WHERE e.incidencia_id IS NULL
),
candidates AS (
  SELECT parse_timestamptz(s.fecha_inicio::text) AS ts FROM svc s WHERE s.fecha_inicio IS NOT NULL
  UNION ALL SELECT hora_llegada_real FROM st WHERE hora_llegada_real IS NOT NULL
  UNION ALL SELECT hora_salida_real FROM st WHERE hora_salida_real IS NOT NULL
  UNION ALL SELECT created_at FROM ev
  UNION ALL SELECT (svc.notas_j->'operacion'->'cancellation'->>'at')::timestamptz
    FROM svc WHERE (svc.notas_j->'operacion'->'cancellation'->>'at') IS NOT NULL
),
win AS (
  SELECT
    s.estado,
    (SELECT min(ts) FROM candidates) AS t_start,
    CASE
      WHEN s.estado IN ('completado', 'anulado') THEN (SELECT max(ts) FROM candidates)
      ELSE now()
    END AS t_end_app,
    (SELECT max(ts) FROM candidates) AS t_end_narrow
  FROM svc s
)
SELECT
  estado,
  t_start,
  t_end_app,
  t_end_narrow,
  CASE WHEN t_end_app > t_end_narrow THEN 'APP usa Date.now() — ventana MÁS ANCHA que SQL estrecho' ELSE 'Ventanas alineadas' END AS window_note
FROM win;

-- 2) Paradas: entrada + salida (integrity parada)
SELECT
  'parada_integrity' AS bucket,
  count(*) FILTER (WHERE hora_llegada_real IS NOT NULL) AS entrada_muelle,
  count(*) FILTER (WHERE hora_salida_real IS NOT NULL) AS salida_finalizada,
  count(*) FILTER (WHERE hora_llegada_real IS NOT NULL) + count(*) FILTER (WHERE hora_salida_real IS NOT NULL) AS subtotal
FROM stops WHERE servicio_id = :'servicio_id';

SELECT id, orden, tipo, nombre,
       hora_llegada_real IS NOT NULL AS entrada,
       hora_salida_real IS NOT NULL AS salida
FROM stops WHERE servicio_id = :'servicio_id' ORDER BY orden;

-- 3) Evidencias por parada (SÍ cuentan en integrity; incidencia_id excluidas)
SELECT e.tipo, count(*) AS n
FROM evidencias e
JOIN stops s ON s.id = e.stop_id
WHERE s.servicio_id = :'servicio_id' AND e.incidencia_id IS NULL
GROUP BY e.tipo ORDER BY n DESC;

SELECT s.orden, s.tipo, s.nombre, e.tipo AS ev_tipo, e.id, e.created_at
FROM evidencias e
JOIN stops s ON s.id = e.stop_id
WHERE s.servicio_id = :'servicio_id' AND e.incidencia_id IS NULL
ORDER BY s.orden, e.created_at;

-- 4) Documentos extra (NO cuentan en integrity — solo listado expediente)
SELECT tipo, archivo_nombre, created_at
FROM servicio_documentos_extra
WHERE servicio_id = :'servicio_id' ORDER BY created_at;

-- 5) Tacógrafo — ventana APP vs estrecha
WITH svc AS (SELECT * FROM servicios WHERE id = :'servicio_id'),
st AS (SELECT * FROM stops WHERE servicio_id = :'servicio_id'),
ev AS (
  SELECT e.created_at FROM evidencias e JOIN st ON st.id = e.stop_id WHERE e.incidencia_id IS NULL
),
candidates AS (
  SELECT fecha_inicio AS ts FROM svc WHERE fecha_inicio IS NOT NULL
  UNION ALL SELECT hora_llegada_real FROM st WHERE hora_llegada_real IS NOT NULL
  UNION ALL SELECT hora_salida_real FROM st WHERE hora_salida_real IS NOT NULL
  UNION ALL SELECT created_at FROM ev
),
win AS (
  SELECT
    (SELECT conductor_id FROM svc) AS conductor_id,
    (SELECT min(ts) FROM candidates) AS t_start,
    CASE WHEN (SELECT estado FROM svc) IN ('completado','anulado')
      THEN (SELECT max(ts) FROM candidates) ELSE now() END AS t_end_app,
    (SELECT max(ts) FROM candidates) AS t_end_narrow
)
SELECT
  e.type,
  count(*) AS n,
  count(*) FILTER (WHERE e.deleted IS TRUE) AS deleted_rows
FROM entries e, win w
WHERE e.user_id = w.conductor_id
  AND e.ts >= w.t_start AND e.ts <= w.t_end_app
  AND e.type ~* '(pausa|descanso|disponibilidad|otros|carga|descarga|inspeccion|repostaje|ferry|incidencia|art12|jornada)'
GROUP BY e.type ORDER BY n DESC;

-- 5b) Misma query con ventana ESTRECHA (hasta último timestamp operativo)
WITH svc AS (SELECT * FROM servicios WHERE id = :'servicio_id'),
st AS (SELECT * FROM stops WHERE servicio_id = :'servicio_id'),
ev AS (
  SELECT e.created_at FROM evidencias e JOIN st ON st.id = e.stop_id WHERE e.incidencia_id IS NULL
),
candidates AS (
  SELECT fecha_inicio AS ts FROM svc WHERE fecha_inicio IS NOT NULL
  UNION ALL SELECT hora_llegada_real FROM st WHERE hora_llegada_real IS NOT NULL
  UNION ALL SELECT hora_salida_real FROM st WHERE hora_salida_real IS NOT NULL
  UNION ALL SELECT created_at FROM ev
),
win AS (
  SELECT
    (SELECT conductor_id FROM svc) AS conductor_id,
    (SELECT min(ts) FROM candidates) AS t_start,
    (SELECT max(ts) FROM candidates) AS t_end_narrow
)
SELECT 'tacografo_ventana_estrecha' AS bucket, count(*) AS total
FROM entries e, win w
WHERE e.user_id = w.conductor_id
  AND e.ts >= w.t_start AND e.ts <= w.t_end_narrow
  AND e.type ~* '(pausa|descanso|disponibilidad|otros|carga|descarga|inspeccion|repostaje|ferry|incidencia|art12|jornada)';

-- 5c) Entries deleted=true que la APP SÍ cuenta (no filtra deleted)
WITH svc AS (SELECT * FROM servicios WHERE id = :'servicio_id'),
win AS (
  SELECT conductor_id, fecha_inicio FROM svc
)
SELECT count(*) AS deleted_but_counted_in_app
FROM entries e, win w
WHERE e.user_id = w.conductor_id AND e.deleted IS TRUE
  AND e.type ~* '(pausa|descanso|disponibilidad|otros|carga|descarga|inspeccion|repostaje|ferry|incidencia|art12|jornada)';

-- 6) TOTAL esperado (réplica manual)
WITH svc AS (SELECT * FROM servicios WHERE id = :'servicio_id'),
st AS (SELECT * FROM stops WHERE servicio_id = :'servicio_id'),
ev AS (
  SELECT e.id FROM evidencias e JOIN st ON st.id = e.stop_id WHERE e.incidencia_id IS NULL
),
meta AS (
  SELECT
    COALESCE((notas::jsonb->'operacion'->>'conductor_assigned_at') IS NOT NULL, false) AS has_asignado,
    (fecha_inicio IS NOT NULL OR (notas::jsonb->'operacion'->>'operational_trip_started_at') IS NOT NULL) AS has_iniciado,
    (estado = 'anulado') AS has_anulado,
    (estado = 'completado') AS has_completado,
    estado
  FROM svc
),
par AS (
  SELECT
    count(*) FILTER (WHERE hora_llegada_real IS NOT NULL) AS entradas,
    count(*) FILTER (WHERE hora_salida_real IS NOT NULL) AS salidas
  FROM st
),
counts AS (
  SELECT
    (SELECT count(*) FROM ev) AS evidencias,
    (SELECT entradas + salidas FROM par) AS paradas,
    (SELECT CASE WHEN has_asignado THEN 1 ELSE 0 END + CASE WHEN has_iniciado THEN 1 ELSE 0 END + CASE WHEN has_anulado THEN 1 ELSE 0 END FROM meta) AS servicio_ev,
    (SELECT CASE WHEN has_completado AND EXISTS (SELECT 1 FROM st WHERE hora_salida_real IS NOT NULL) THEN 1 ELSE 0 END FROM meta) AS entrega
)
SELECT
  c.*,
  (SELECT count(*) FROM entries e JOIN svc s ON e.user_id = s.conductor_id
    WHERE e.type ~* '(pausa|descanso|disponibilidad|otros|carga|descarga|inspeccion|repostaje|ferry|incidencia|art12|jornada)'
      AND e.deleted IS NOT TRUE
      -- sustituir por ventana APP real según query 1
  ) AS tacografo_placeholder,
  c.servicio_ev + c.paradas + c.evidencias + c.entrega AS subtotal_sin_tacografo
FROM counts c;
