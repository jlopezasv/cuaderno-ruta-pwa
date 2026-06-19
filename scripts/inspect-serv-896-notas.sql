-- Inspección stops.notas para un servicio (ej. SERV-896) en Supabase DEMO SQL Editor.
-- Muestra el string completo y los bytes alrededor de __CUADERNO_OP__:

WITH svc AS (
  SELECT id, left(referencia, 80) AS referencia_head
  FROM public.servicios
  WHERE left(split_part(coalesce(referencia, ''), E'\n', 1), 20) LIKE 'SERV-896%'
     OR referencia LIKE 'SERV-896%'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  s.orden,
  s.tipo,
  s.nombre,
  s.notas AS notas_raw,
  length(s.notas) AS notas_len,
  position('__CUADERNO_OP__:' IN coalesce(s.notas, '')) AS pos_bare_mark,
  position(E'\n\n__CUADERNO_OP__:' IN coalesce(s.notas, '')) AS pos_lf_lf_mark,
  position(E'\n__CUADERNO_OP__:' IN coalesce(s.notas, '')) AS pos_lf_mark,
  encode(
    substring(
      s.notas
      FROM greatest(1, position('__CUADERNO_OP__:' IN coalesce(s.notas, '')) - 6)
      FOR 28
    )::bytea,
    'hex'
  ) AS hex_around_mark,
  public.stop_operacion_meta_json(s.notas) AS meta_json,
  public.stop_parte_transporte_id(s.notas) AS parte_transporte_id_sql
FROM public.stops s
JOIN svc ON svc.id = s.servicio_id
ORDER BY s.orden;
