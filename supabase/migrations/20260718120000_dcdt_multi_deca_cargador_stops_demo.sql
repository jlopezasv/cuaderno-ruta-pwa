-- DEMO: DeCA múltiple por cargador + estado operativo en paradas (Paso 1 esquema)
-- Proyecto: cuaderno-demo-ab.vercel.app · Supabase fezacjtbavgdosncxlzw
-- NO aplicar en REAL sin revisión.
--
-- Aplicar en DEMO:
--   node scripts/apply-sql-file.mjs supabase/migrations/20260718120000_dcdt_multi_deca_cargador_stops_demo.sql
--
-- Cambios:
--   - dcdt_servicio: 1 servicio → N filas DeCA (quita UNIQUE servicio_id)
--   - dcdt_servicio.fecha_inicio_efectivo (Fase 2 fijará al completar 1ª carga del DeCA)
--   - stops.completada_at / completada_por (estado ya existía: pendiente|en_camino|llegado|completado)

-- ── 1) dcdt_servicio: 1:N por servicio ───────────────────────────────────────

ALTER TABLE public.dcdt_servicio
  DROP CONSTRAINT IF EXISTS dcdt_servicio_servicio_id_key;

ALTER TABLE public.dcdt_servicio
  DROP CONSTRAINT IF EXISTS carta_porte_servicio_servicio_id_key;

CREATE INDEX IF NOT EXISTS idx_dcdt_servicio_servicio_id
  ON public.dcdt_servicio (servicio_id);

ALTER TABLE public.dcdt_servicio
  ADD COLUMN IF NOT EXISTS fecha_inicio_efectivo timestamptz;

COMMENT ON COLUMN public.dcdt_servicio.fecha_inicio_efectivo IS
  'Inicio efectivo del transporte cubierto por ESTE DeCA (1ª parada de carga del grupo). '
  'Se fija en Fase 2 al completarse esa carga; inmutable una vez asignada.';

COMMENT ON TABLE public.dcdt_servicio IS
  'DeCA por servicio y cargador contractual: varias filas por servicio_id (1:N). '
  'datos.partes.cargador_id identifica el cargador del documento.';

-- ── 2) stops: auditoría de cierre + CHECK alineado con valores reales ───────
-- estado ya existía (flujo conductor: pendiente → en_camino? → llegado → completado).
-- NO renombrar valores ni migrar filas.

ALTER TABLE public.stops
  ADD COLUMN IF NOT EXISTS completada_at timestamptz,
  ADD COLUMN IF NOT EXISTS completada_por uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.stops
  DROP CONSTRAINT IF EXISTS stops_estado_check;

ALTER TABLE public.stops
  ADD CONSTRAINT stops_estado_check
  CHECK (estado IN ('pendiente', 'en_camino', 'llegado', 'completado'));

COMMENT ON COLUMN public.stops.estado IS
  'Estado operativo de la parada: pendiente | en_camino | llegado | completado. '
  'Independiente del orden orientativo (stops.orden).';
COMMENT ON COLUMN public.stops.completada_at IS
  'Marca temporal al pasar a completado (Fase 2; hoy la app usa hora_salida_real).';
COMMENT ON COLUMN public.stops.completada_por IS
  'Usuario que marcó la parada como completada (Fase 2).';

CREATE INDEX IF NOT EXISTS idx_stops_servicio_estado
  ON public.stops (servicio_id, estado);

-- ── 3) Helpers: meta __CUADERNO_OP__ en stops.notas ─────────────────────────

CREATE OR REPLACE FUNCTION public.stop_operacion_meta_json(p_notas text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  raw text;
BEGIN
  IF p_notas IS NULL OR position('__CUADERNO_OP__:' IN p_notas) = 0 THEN
    RETURN '{}'::jsonb;
  END IF;
  raw := trim(substring(p_notas FROM '__CUADERNO_OP__:(.*)$'));
  IF raw IS NULL OR raw = '' THEN
    RETURN '{}'::jsonb;
  END IF;
  BEGIN
    RETURN raw::jsonb;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN '{}'::jsonb;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_parte_transporte_id(p_notas text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(trim(public.stop_operacion_meta_json(p_notas) ->> 'parte_transporte_id'), '')::uuid;
$$;

COMMENT ON FUNCTION public.stop_parte_transporte_id(text) IS
  'Lee parte_transporte_id (cargador/destinatario) embebido en stops.notas.';

-- ── 4) Agrupación lectura: paradas carga por cargador ────────────────────────

CREATE OR REPLACE FUNCTION public.dcdt_cargador_groups_for_servicio(p_servicio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_servicio_id IS NULL THEN
    RETURN jsonb_build_object(
      'servicio_id', NULL,
      'group_count', 0,
      'groups', '[]'::jsonb,
      'ungrouped_carga_stops', '[]'::jsonb
    );
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.user_can_access_servicio(p_servicio_id) THEN
    RAISE EXCEPTION 'sin acceso al servicio %', p_servicio_id USING ERRCODE = '42501';
  END IF;

  WITH carga_stops AS (
    SELECT
      s.id,
      s.orden,
      s.tipo,
      s.nombre,
      s.direccion,
      s.notas,
      s.estado,
      s.completada_at,
      s.completada_por,
      public.stop_parte_transporte_id(s.notas) AS cargador_id
    FROM public.stops s
    WHERE s.servicio_id = p_servicio_id
      AND lower(coalesce(s.tipo, '')) = 'carga'
  ),
  grouped AS (
    SELECT
      cs.cargador_id,
      jsonb_agg(
        jsonb_build_object(
          'id', cs.id,
          'orden', cs.orden,
          'tipo', cs.tipo,
          'nombre', cs.nombre,
          'direccion', cs.direccion,
          'estado', cs.estado,
          'completada_at', cs.completada_at,
          'completada_por', cs.completada_por,
          'cargador_id', cs.cargador_id
        )
        ORDER BY cs.orden
      ) AS stops
    FROM carga_stops cs
    WHERE cs.cargador_id IS NOT NULL
    GROUP BY cs.cargador_id
  ),
  ungrouped AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', cs.id,
          'orden', cs.orden,
          'tipo', cs.tipo,
          'nombre', cs.nombre,
          'direccion', cs.direccion,
          'estado', cs.estado,
          'completada_at', cs.completada_at,
          'completada_por', cs.completada_por,
          'cargador_id', NULL
        )
        ORDER BY cs.orden
      ),
      '[]'::jsonb
    ) AS stops
    FROM carga_stops cs
    WHERE cs.cargador_id IS NULL
  )
  SELECT jsonb_build_object(
    'servicio_id', p_servicio_id,
    'group_count', (SELECT count(*)::int FROM grouped),
    'groups', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'cargador_id', g.cargador_id,
            'stop_count', jsonb_array_length(g.stops),
            'stops', g.stops
          )
          ORDER BY g.cargador_id
        )
        FROM grouped g
      ),
      '[]'::jsonb
    ),
    'ungrouped_carga_stops', (SELECT stops FROM ungrouped)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.dcdt_cargador_groups_for_servicio(uuid) IS
  'Solo lectura: agrupa paradas tipo carga por cargador_id (parte_transporte_id en notas). '
  'Cada grupo distinto implica un DeCA propio en Fase 2.';

REVOKE ALL ON FUNCTION public.stop_operacion_meta_json(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stop_parte_transporte_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dcdt_cargador_groups_for_servicio(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.stop_operacion_meta_json(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stop_parte_transporte_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dcdt_cargador_groups_for_servicio(uuid) TO authenticated, service_role;
