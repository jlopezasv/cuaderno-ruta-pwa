-- Verificación DEMO — Paso 2.5: cargador_parte_id explícito en descargas
-- Proyecto: fezacjtbavgdosncxlzw

-- ── A) Caso simple (1 cargador): descarga hereda sin UI ─────────────────────

SELECT
  st.orden,
  st.tipo,
  public.stop_parte_transporte_id(st.notas) AS parte_id,
  public.stop_operacion_meta_json(st.notas) ->> 'cargador_parte_id' AS cargador_parte_id,
  public.stop_operacion_meta_json(st.notas) ->> 'dcdt_servicio_id' AS dcdt_id
FROM public.stops st
WHERE st.servicio_id = (
  SELECT s.id FROM public.servicios s
  WHERE coalesce(s.service_number, '') ILIKE '%115%'
  ORDER BY s.created_at DESC LIMIT 1
)
ORDER BY st.orden;

-- Esperado SERV-115: descargas con cargador_parte_id = mismo UUID que la carga
-- (o auto al guardar); un solo dcdt_id en todas las paradas vinculadas.

-- ── B) Caso 4 paradas: Carga A, Carga B, Descarga A, Descarga B ─────────────
-- Sustituye SERVICIO_ID tras crear el servicio de prueba en la UI.

/*
SELECT
  st.orden,
  st.tipo,
  st.nombre,
  public.stop_parte_transporte_id(st.notas) AS destinatario_o_cargador_parte,
  public.stop_operacion_meta_json(st.notas) ->> 'cargador_parte_id' AS cargador_parte_id,
  public.stop_operacion_meta_json(st.notas) ->> 'dcdt_servicio_id' AS dcdt_servicio_id,
  d.datos -> 'partes' ->> 'cargador_id' AS deca_cargador_id
FROM public.stops st
LEFT JOIN public.dcdt_servicio d
  ON d.id = (public.stop_operacion_meta_json(st.notas) ->> 'dcdt_servicio_id')::uuid
WHERE st.servicio_id = 'PEGAR_SERVICIO_ID'
ORDER BY st.orden;

-- Esperado tras elegir en UI "Descarga A → cargador A" y "Descarga B → cargador B":
-- orden 1 (carga A):  cargador_parte_id NULL, dcdt = DeCA-A
-- orden 2 (carga B):  cargador_parte_id NULL, dcdt = DeCA-B
-- orden 3 (desc A):   cargador_parte_id = UUID-A, dcdt = DeCA-A  (NO DeCA-B)
-- orden 4 (desc B):   cargador_parte_id = UUID-B, dcdt = DeCA-B
*/

-- ── C) Descarga sin elegir (2+ cargadores) → ungrouped ───────────────────────

SELECT
  st.orden,
  st.tipo,
  public.stop_operacion_meta_json(st.notas) ->> 'cargador_parte_id' AS cargador_parte_id,
  public.stop_operacion_meta_json(st.notas) ->> 'dcdt_servicio_id' AS dcdt_servicio_id
FROM public.stops st
WHERE st.servicio_id = 'PEGAR_SERVICIO_ID'
  AND lower(st.tipo) = 'descarga'
  AND public.stop_operacion_meta_json(st.notas) ->> 'cargador_parte_id' IS NULL
  AND (
    SELECT count(DISTINCT public.stop_parte_transporte_id(s2.notas))
    FROM public.stops s2
    WHERE s2.servicio_id = st.servicio_id
      AND lower(s2.tipo) = 'carga'
      AND public.stop_parte_transporte_id(s2.notas) IS NOT NULL
  ) >= 2;

-- Esperado: dcdt_servicio_id NULL en esas filas (no asignadas a ciegas).

-- ── D) Igualdad DeCA por cargador (mismo servicio multi-cargador) ───────────

SELECT
  d.id AS dcdt_id,
  d.datos -> 'partes' ->> 'cargador_id' AS cargador_id,
  count(st.id) FILTER (WHERE lower(st.tipo) = 'carga') AS cargas,
  count(st.id) FILTER (WHERE lower(st.tipo) = 'descarga') AS descargas
FROM public.dcdt_servicio d
LEFT JOIN public.stops st
  ON (public.stop_operacion_meta_json(st.notas) ->> 'dcdt_servicio_id')::uuid = d.id
WHERE d.servicio_id = 'PEGAR_SERVICIO_ID'
GROUP BY d.id, d.datos
ORDER BY d.created_at;
