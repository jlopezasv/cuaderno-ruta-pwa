-- Código de equipo legible y único para vincular conductores (empresa ↔ conductor).
-- Compatibilidad: sincroniza codigo_corto cuando venía vacío; backfill empresas antiguas.

-- 1) Columna (si existe la tabla)
DO $$
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RAISE NOTICE 'empresas: tabla no existe, se omite migración codigo_equipo';
  ELSE
    ALTER TABLE public.empresas
      ADD COLUMN IF NOT EXISTS codigo_equipo text;
  END IF;
END $$;

-- 2) Base alfanumérica desde nombre (ej. CANILES → CANILES-2044)
CREATE OR REPLACE FUNCTION public._empresa_codigo_base(p_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT CASE
    WHEN length(b) < 2 THEN 'EQ'
    ELSE b
  END
  FROM (
    SELECT upper(left(regexp_replace(coalesce(p_nombre, ''), '[^a-zA-Z0-9]', '', 'g'), 12)) AS b
  ) s;
$f$;

-- 3) Backfill
DO $$
DECLARE
  r record;
  base text;
  cand text;
  tries int;
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, nombre, codigo_corto
    FROM public.empresas
    WHERE codigo_equipo IS NULL OR trim(codigo_equipo) = ''
  LOOP
    IF r.codigo_corto IS NOT NULL AND length(trim(r.codigo_corto)) > 0 THEN
      cand := upper(trim(r.codigo_corto));
      IF NOT EXISTS (
        SELECT 1 FROM public.empresas e
        WHERE e.codigo_equipo = cand AND e.id <> r.id
      ) THEN
        UPDATE public.empresas
        SET codigo_equipo = cand
        WHERE id = r.id;
        UPDATE public.empresas
        SET codigo_corto = coalesce(nullif(trim(codigo_corto), ''), codigo_equipo)
        WHERE id = r.id AND (codigo_corto IS NULL OR trim(codigo_corto) = '');
        CONTINUE;
      END IF;
    END IF;

    base := public._empresa_codigo_base(r.nombre);
    tries := 0;
    LOOP
      cand := base || '-' || lpad((floor(random() * 10000)::int % 10000)::text, 4, '0');
      tries := tries + 1;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.empresas e
        WHERE e.codigo_equipo = cand AND e.id <> r.id
      );
      EXIT WHEN tries > 200;
    END LOOP;

    IF tries > 200 THEN
      cand := base || '-' || upper(substr(replace(r.id::text, '-', ''), 1, 4));
    END IF;

    UPDATE public.empresas
    SET codigo_equipo = left(cand, 32)
    WHERE id = r.id;

    UPDATE public.empresas
    SET codigo_corto = coalesce(nullif(trim(codigo_corto), ''), codigo_equipo)
    WHERE id = r.id AND (codigo_corto IS NULL OR trim(codigo_corto) = '');
  END LOOP;
END $$;

-- 4) Unicidad + NOT NULL
DO $$
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RETURN;
  END IF;
  DROP INDEX IF EXISTS public.empresas_codigo_equipo_uidx;
  CREATE UNIQUE INDEX empresas_codigo_equipo_uidx
    ON public.empresas (codigo_equipo);
  ALTER TABLE public.empresas
    ALTER COLUMN codigo_equipo SET NOT NULL;
END $$;

-- 5) Trigger nuevas filas / correcciones
CREATE OR REPLACE FUNCTION public.empresas_bi_codigo_equipo_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $tr$
DECLARE
  base text;
  cand text;
  tries int;
BEGIN
  IF NEW.codigo_equipo IS NOT NULL AND length(trim(NEW.codigo_equipo)) > 0 THEN
    NEW.codigo_equipo := upper(trim(NEW.codigo_equipo));
  ELSIF NEW.codigo_corto IS NOT NULL AND length(trim(NEW.codigo_corto)) > 0 THEN
    cand := upper(trim(NEW.codigo_corto));
    IF NOT EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.codigo_equipo = cand AND e.id IS DISTINCT FROM NEW.id
    ) THEN
      NEW.codigo_equipo := cand;
    END IF;
  END IF;

  IF NEW.codigo_equipo IS NULL OR length(trim(NEW.codigo_equipo)) = 0 THEN
    base := public._empresa_codigo_base(NEW.nombre);
    tries := 0;
    LOOP
      cand := base || '-' || lpad((floor(random() * 10000)::int % 10000)::text, 4, '0');
      tries := tries + 1;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.empresas e
        WHERE e.codigo_equipo = cand AND e.id IS DISTINCT FROM NEW.id
      );
      EXIT WHEN tries > 200;
    END LOOP;
    IF tries > 200 THEN
      cand := base || '-' || upper(substr(replace(COALESCE(NEW.id, gen_random_uuid())::text, '-', ''), 1, 4));
    END IF;
    NEW.codigo_equipo := left(upper(cand), 32);
  END IF;

  IF NEW.codigo_corto IS NULL OR length(trim(NEW.codigo_corto)) = 0 THEN
    NEW.codigo_corto := NEW.codigo_equipo;
  ELSE
    NEW.codigo_corto := trim(NEW.codigo_corto);
  END IF;

  RETURN NEW;
END;
$tr$;

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS empresas_bi_codigo_equipo ON public.empresas;
  CREATE TRIGGER empresas_bi_codigo_equipo
    BEFORE INSERT OR UPDATE ON public.empresas
    FOR EACH ROW
    EXECUTE FUNCTION public.empresas_bi_codigo_equipo_fn();
END $$;

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NOT NULL THEN
    COMMENT ON COLUMN public.empresas.codigo_equipo IS
      'Código legible único para vincular conductores (ej. TC-4821). Preferir este campo en UI frente a UUID.';
  END IF;
END $$;
