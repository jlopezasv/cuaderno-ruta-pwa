COMMENT ON TABLE public.incidencias IS
  'Incidencias operativas por servicio. Independientes de la cronología (muelle, tacógrafo, etc.).';

COMMENT ON COLUMN public.incidencias.fase_operativa IS
  'carga | en_ruta | descarga | finalizacion — snapshot al registrar.';

COMMENT ON COLUMN public.incidencias.servicio_estado IS
  'Snapshot de servicios.estado en el momento del registro.';

COMMENT ON COLUMN public.incidencias.legacy_evidencia_id IS
  'Trazabilidad migración desde evidencias.tipo incidencia/nota.';

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
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS incidencias_updated_at ON public.incidencias;
CREATE TRIGGER incidencias_updated_at
  BEFORE UPDATE ON public.incidencias
  FOR EACH ROW
  EXECUTE FUNCTION public.incidencias_set_updated_at();

CREATE OR REPLACE FUNCTION public.incidencias_validate_servicio_stop()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
    SELECT 1 FROM public.stops st
    WHERE st.id = NEW.stop_id AND st.servicio_id = NEW.servicio_id
  ) THEN
    RAISE EXCEPTION 'incidencias: stop_id no pertenece al servicio';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS incidencias_validate_servicio_stop ON public.incidencias;
CREATE TRIGGER incidencias_validate_servicio_stop
  BEFORE INSERT OR UPDATE ON public.incidencias
  FOR EACH ROW
  EXECUTE FUNCTION public.incidencias_validate_servicio_stop();

ALTER TABLE public.evidencias
  ADD COLUMN IF NOT EXISTS incidencia_id uuid REFERENCES public.incidencias(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS evidencias_incidencia_id_idx
  ON public.evidencias (incidencia_id)
  WHERE incidencia_id IS NOT NULL;

COMMENT ON COLUMN public.evidencias.incidencia_id IS
  'Si NOT NULL: foto evidencia de una incidencia (no foto documental suelta).';

CREATE OR REPLACE FUNCTION public.evidencias_validate_incidencia_adjunto()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
    RAISE EXCEPTION 'evidencias: incidencia_id inválido';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stops st
    WHERE st.id = NEW.stop_id AND st.servicio_id = v_servicio
  ) THEN
    RAISE EXCEPTION 'evidencias: stop_id no coincide con servicio de la incidencia';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidencias_validate_incidencia_adjunto ON public.evidencias;
CREATE TRIGGER evidencias_validate_incidencia_adjunto
  BEFORE INSERT OR UPDATE ON public.evidencias
  FOR EACH ROW
  EXECUTE FUNCTION public.evidencias_validate_incidencia_adjunto();
