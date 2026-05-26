-- =============================================================================
-- PR-1 INCIDENCIAS — SQL único para Supabase DEMO
-- Idempotente. Ejecutar TODO este archivo de una sola vez (Run).
-- No usar copias parciales desde el chat.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PREFLIGHT: dependencias del esquema Demo (cuaderno-pwa)
-- -----------------------------------------------------------------------------
DO $pr1_preflight$
DECLARE
  missing text := '';
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    missing := missing || ' public.empresas';
  END IF;
  IF to_regclass('public.servicios') IS NULL THEN
    missing := missing || ' public.servicios';
  END IF;
  IF to_regclass('public.stops') IS NULL THEN
    missing := missing || ' public.stops';
  END IF;
  IF to_regclass('public.evidencias') IS NULL THEN
    missing := missing || ' public.evidencias';
  END IF;
  IF missing <> '' THEN
    RAISE EXCEPTION 'PR-1 preflight: faltan tablas:%', missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stops'
      AND column_name = 'servicio_id'
  ) THEN
    RAISE EXCEPTION 'PR-1 preflight: public.stops.servicio_id no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'evidencias'
      AND column_name = 'stop_id'
  ) THEN
    RAISE EXCEPTION 'PR-1 preflight: public.evidencias.stop_id no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'user_can_access_servicio'
  ) THEN
    RAISE EXCEPTION 'PR-1 preflight: falta funcion public.user_can_access_servicio(uuid)';
  END IF;
END;
$pr1_preflight$;

-- -----------------------------------------------------------------------------
-- 1) Tabla incidencias
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  stop_id uuid REFERENCES public.stops(id) ON DELETE SET NULL,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conductor_id uuid,
  titulo text NOT NULL,
  descripcion text,
  fase_operativa text NOT NULL,
  servicio_estado text NOT NULL,
  servicio_referencia text,
  conductor_nombre text,
  cliente_nombre text,
  registrado_en timestamptz NOT NULL DEFAULT now(),
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_evidencia_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incidencias_titulo_min_len CHECK (char_length(trim(titulo)) >= 3),
  CONSTRAINT incidencias_fase_operativa_check CHECK (
    fase_operativa IN ('carga', 'en_ruta', 'descarga', 'finalizacion')
  )
);

COMMENT ON TABLE public.incidencias IS
  'Incidencias operativas por servicio. Independientes de la cronologia operativa.';

COMMENT ON COLUMN public.incidencias.fase_operativa IS
  'carga | en_ruta | descarga | finalizacion';

COMMENT ON COLUMN public.incidencias.servicio_estado IS
  'Snapshot de servicios.estado al registrar.';

COMMENT ON COLUMN public.incidencias.legacy_evidencia_id IS
  'Trazabilidad migracion desde evidencias.tipo incidencia/nota.';

CREATE UNIQUE INDEX IF NOT EXISTS incidencias_legacy_evidencia_id_uidx
  ON public.incidencias (legacy_evidencia_id)
  WHERE legacy_evidencia_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS incidencias_empresa_registrado_idx
  ON public.incidencias (empresa_id, registrado_en DESC);

CREATE INDEX IF NOT EXISTS incidencias_servicio_registrado_idx
  ON public.incidencias (servicio_id, registrado_en DESC);

CREATE INDEX IF NOT EXISTS incidencias_conductor_registrado_idx
  ON public.incidencias (conductor_id, registrado_en DESC)
  WHERE conductor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS incidencias_empresa_fase_idx
  ON public.incidencias (empresa_id, fase_operativa);

CREATE INDEX IF NOT EXISTS incidencias_empresa_cliente_idx
  ON public.incidencias (empresa_id, cliente_nombre)
  WHERE cliente_nombre IS NOT NULL;

CREATE OR REPLACE FUNCTION public.incidencias_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS incidencias_updated_at ON public.incidencias;
CREATE TRIGGER incidencias_updated_at
  BEFORE UPDATE ON public.incidencias
  FOR EACH ROW
  EXECUTE FUNCTION public.incidencias_set_updated_at();

CREATE OR REPLACE FUNCTION public.incidencias_validate_servicio_stop()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT s.empresa_id INTO v_empresa
  FROM public.servicios s
  WHERE s.id = NEW.servicio_id;

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'incidencias: servicio sin empresa_id';
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM v_empresa THEN
    RAISE EXCEPTION 'incidencias: empresa_id no coincide con el servicio';
  END IF;

  IF NEW.stop_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.stops st
    WHERE st.id = NEW.stop_id
      AND st.servicio_id = NEW.servicio_id
  ) THEN
    RAISE EXCEPTION 'incidencias: stop_id no pertenece al servicio';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS incidencias_validate_servicio_stop ON public.incidencias;
CREATE TRIGGER incidencias_validate_servicio_stop
  BEFORE INSERT OR UPDATE ON public.incidencias
  FOR EACH ROW
  EXECUTE FUNCTION public.incidencias_validate_servicio_stop();

-- -----------------------------------------------------------------------------
-- 2) evidencias.incidencia_id
-- -----------------------------------------------------------------------------
DO $pr1_add_col$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'evidencias'
      AND column_name = 'incidencia_id'
  ) THEN
    ALTER TABLE public.evidencias
      ADD COLUMN incidencia_id uuid REFERENCES public.incidencias(id) ON DELETE CASCADE;
  END IF;
END;
$pr1_add_col$;

CREATE INDEX IF NOT EXISTS evidencias_incidencia_id_idx
  ON public.evidencias (incidencia_id)
  WHERE incidencia_id IS NOT NULL;

COMMENT ON COLUMN public.evidencias.incidencia_id IS
  'Foto adjunta a incidencia (tipo=foto). NULL = foto documental suelta.';

CREATE OR REPLACE FUNCTION public.evidencias_validate_incidencia_adjunto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_servicio uuid;
BEGIN
  IF NEW.incidencia_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo IS DISTINCT FROM 'foto' THEN
    RAISE EXCEPTION 'evidencias: adjunto de incidencia debe ser tipo foto';
  END IF;

  SELECT i.servicio_id INTO v_servicio
  FROM public.incidencias i
  WHERE i.id = NEW.incidencia_id;

  IF v_servicio IS NULL THEN
    RAISE EXCEPTION 'evidencias: incidencia_id invalido';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stops st
    WHERE st.id = NEW.stop_id
      AND st.servicio_id = v_servicio
  ) THEN
    RAISE EXCEPTION 'evidencias: stop_id no coincide con servicio de la incidencia';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS evidencias_validate_incidencia_adjunto ON public.evidencias;
CREATE TRIGGER evidencias_validate_incidencia_adjunto
  BEFORE INSERT OR UPDATE ON public.evidencias
  FOR EACH ROW
  EXECUTE FUNCTION public.evidencias_validate_incidencia_adjunto();

-- -----------------------------------------------------------------------------
-- 3) Politicas evidencias (ampliadas)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS ev_sel ON public.evidencias;
DROP POLICY IF EXISTS ev_ins ON public.evidencias;
DROP POLICY IF EXISTS ev_upd ON public.evidencias;
DROP POLICY IF EXISTS ev_del ON public.evidencias;
DROP POLICY IF EXISTS "ev_sel" ON public.evidencias;
DROP POLICY IF EXISTS "ev_ins" ON public.evidencias;
DROP POLICY IF EXISTS "ev_upd" ON public.evidencias;
DROP POLICY IF EXISTS "ev_del" ON public.evidencias;

CREATE POLICY ev_sel ON public.evidencias
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.incidencias inc
      WHERE inc.id = evidencias.incidencia_id
        AND public.user_can_access_servicio(inc.servicio_id)
    )
  );

CREATE POLICY ev_ins ON public.evidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    AND (
      evidencias.incidencia_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.incidencias inc
        WHERE inc.id = evidencias.incidencia_id
          AND inc.servicio_id = (
            SELECT st2.servicio_id
            FROM public.stops st2
            WHERE st2.id = evidencias.stop_id
          )
          AND public.user_can_access_servicio(inc.servicio_id)
      )
    )
  );

CREATE POLICY ev_upd ON public.evidencias
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.incidencias inc
      WHERE inc.id = evidencias.incidencia_id
        AND public.user_can_access_servicio(inc.servicio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    AND (
      evidencias.incidencia_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.incidencias inc
        WHERE inc.id = evidencias.incidencia_id
          AND public.user_can_access_servicio(inc.servicio_id)
      )
    )
  );

CREATE POLICY ev_del ON public.evidencias
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.incidencias inc
      WHERE inc.id = evidencias.incidencia_id
        AND public.user_can_access_servicio(inc.servicio_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 4) Vista resumen empresa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_servicio_incidencias_resumen AS
SELECT
  s.id AS servicio_id,
  s.empresa_id,
  s.estado AS servicio_estado_actual,
  s.conductor_id AS servicio_conductor_id_actual,
  COUNT(i.id)::integer AS total_incidencias,
  MAX(i.registrado_en) AS ultima_incidencia_en,
  (
    SELECT i2.titulo
    FROM public.incidencias i2
    WHERE i2.servicio_id = s.id
    ORDER BY i2.registrado_en DESC, i2.created_at DESC
    LIMIT 1
  ) AS ultimo_titulo,
  (
    SELECT i2.conductor_nombre
    FROM public.incidencias i2
    WHERE i2.servicio_id = s.id
    ORDER BY i2.registrado_en DESC, i2.created_at DESC
    LIMIT 1
  ) AS ultimo_conductor_nombre,
  (
    SELECT COUNT(*)::integer
    FROM public.evidencias e
    INNER JOIN public.incidencias i3 ON i3.id = e.incidencia_id
    WHERE i3.servicio_id = s.id
  ) AS total_fotos,
  EXISTS (
    SELECT 1
    FROM public.evidencias e
    INNER JOIN public.incidencias i3 ON i3.id = e.incidencia_id
    WHERE i3.servicio_id = s.id
  ) AS tiene_fotos
FROM public.servicios s
INNER JOIN public.incidencias i ON i.servicio_id = s.id
GROUP BY s.id, s.empresa_id, s.estado, s.conductor_id;

COMMENT ON VIEW public.v_servicio_incidencias_resumen IS
  'Resumen por servicio con incidencias. servicio_estado_actual en tiempo real.';

-- -----------------------------------------------------------------------------
-- 5) RLS incidencias
-- -----------------------------------------------------------------------------
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.incidencias TO authenticated;
GRANT ALL ON public.incidencias TO service_role;
GRANT SELECT ON public.v_servicio_incidencias_resumen TO authenticated;
GRANT ALL ON public.v_servicio_incidencias_resumen TO service_role;

DROP POLICY IF EXISTS inc_sel ON public.incidencias;
DROP POLICY IF EXISTS inc_ins ON public.incidencias;
DROP POLICY IF EXISTS "inc_sel" ON public.incidencias;
DROP POLICY IF EXISTS "inc_ins" ON public.incidencias;

CREATE POLICY inc_sel ON public.incidencias
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY inc_ins ON public.incidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_servicio(servicio_id)
    AND empresa_id = (
      SELECT sv.empresa_id
      FROM public.servicios sv
      WHERE sv.id = servicio_id
    )
    AND (
      stop_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.stops st
        WHERE st.id = stop_id
          AND st.servicio_id = incidencias.servicio_id
      )
    )
  );

COMMIT;
