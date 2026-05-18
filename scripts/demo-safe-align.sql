-- =============================================================================
-- DEMO SAFE ALIGN — idempotente, sin borrar datos
--
-- Pensado para Supabase DEMO cuando falla: ERROR: must be owner of table
--
-- NO incluye:
--   • GRANT / REVOKE (tablas ni funciones)
--   • ALTER OWNER / cambios de ownership
--   • Tablas legacy: entries, gastos, km_logs, cmr_docs, subscriptions,
--     push_*, documentos, parkings, asignaciones (legacy)
--   • Migración 20260518160000_revoke_anon_table_grants
--
-- SÍ incluye (con SKIP silencioso si no hay permisos):
--   • Tablas operativas nuevas
--   • Columnas operativas (ADD IF NOT EXISTS)
--   • Funciones RLS (CREATE OR REPLACE)
--   • Policies operativas
--   • Triggers operativos
--   • Buckets user-photos / cmr + policies storage
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: ejecutar solo si la tabla existe y somos owner (o superuser)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._demo_safe_table_owned(p_schema text, p_table text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = p_schema
      AND c.relname = p_table
      AND c.relkind IN ('r', 'p')
      AND (
        pg_has_role(c.relowner, 'MEMBER')
        OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public._demo_safe_exec(p_sql text, p_label text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '[demo-safe skip %] %', coalesce(p_label, '?'), SQLERRM;
END;
$$;

-- =============================================================================
-- 1) Tablas operativas nuevas
-- =============================================================================

SELECT public._demo_safe_exec($sql$
CREATE TABLE IF NOT EXISTS public.servicio_documentos_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descripcion text,
  url text,
  archivo_nombre text,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
)$sql$, 'create servicio_documentos_extra');

SELECT public._demo_safe_exec($sql$
CREATE INDEX IF NOT EXISTS idx_servicio_documentos_extra_servicio
  ON public.servicio_documentos_extra (servicio_id)
$sql$, 'idx servicio_documentos_extra');

SELECT public._demo_safe_exec($sql$
CREATE TABLE IF NOT EXISTS public.documentacion_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  destinatarios text NOT NULL,
  asunto text NOT NULL,
  mensaje text,
  adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado text NOT NULL DEFAULT 'enviado',
  error_detalle text,
  enviado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
)$sql$, 'create documentacion_envios');

SELECT public._demo_safe_exec($sql$
CREATE INDEX IF NOT EXISTS idx_documentacion_envios_servicio
  ON public.documentacion_envios (servicio_id)
$sql$, 'idx documentacion_envios');

SELECT public._demo_safe_exec($sql$
CREATE TABLE IF NOT EXISTS public.servicio_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  stop_id uuid REFERENCES public.stops (id) ON DELETE SET NULL,
  conductor_id uuid NOT NULL,
  tipo_asignacion text NOT NULL DEFAULT 'principal',
  created_at timestamptz NOT NULL DEFAULT now()
)$sql$, 'create servicio_asignaciones');

SELECT public._demo_safe_exec($sql$
CREATE INDEX IF NOT EXISTS idx_servicio_asignaciones_servicio
  ON public.servicio_asignaciones (servicio_id)
$sql$, 'idx servicio_asignaciones');

-- =============================================================================
-- 2) Columnas operativas (solo ADD, sin NOT NULL forzado)
-- =============================================================================

DO $$
DECLARE
  t text;
  ddl text;
  alters text[][] := ARRAY[
    ARRAY['servicios', 'ALTER TABLE public.servicios ALTER COLUMN conductor_id DROP NOT NULL'],
    ARRAY['servicios', 'ALTER TABLE public.servicios ALTER COLUMN empresa_id DROP NOT NULL'],
    ARRAY['documentacion_envios', 'ALTER TABLE public.documentacion_envios ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL'],
    ARRAY['profiles', 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false'],
    ARRAY['empresas', 'ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS codigo_equipo text'],
    ARRAY['ubicaciones', 'ALTER TABLE public.ubicaciones ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL'],
    ARRAY['ubicaciones', 'ALTER TABLE public.ubicaciones ADD COLUMN IF NOT EXISTS servicio_id uuid REFERENCES public.servicios (id) ON DELETE SET NULL'],
    ARRAY['ubicaciones', 'ALTER TABLE public.ubicaciones ADD COLUMN IF NOT EXISTS stop_id uuid REFERENCES public.stops (id) ON DELETE SET NULL'],
    ARRAY['ubicaciones', 'ALTER TABLE public.ubicaciones ADD COLUMN IF NOT EXISTS event_type text'],
    ARRAY['servicio_documentos_extra', 'ALTER TABLE public.servicio_documentos_extra ADD COLUMN IF NOT EXISTS stop_id uuid REFERENCES public.stops (id) ON DELETE SET NULL'],
    ARRAY['servicio_documentos_extra', 'ALTER TABLE public.servicio_documentos_extra ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL'],
    ARRAY['servicio_documentos_extra', 'ALTER TABLE public.servicio_documentos_extra ADD COLUMN IF NOT EXISTS conductor_id uuid'],
    ARRAY['servicio_documentos_extra', 'ALTER TABLE public.servicio_documentos_extra ADD COLUMN IF NOT EXISTS archivo_url text'],
    ARRAY['servicio_documentos_extra', 'ALTER TABLE public.servicio_documentos_extra ADD COLUMN IF NOT EXISTS mime_type text'],
    ARRAY['servicio_documentos_extra', 'ALTER TABLE public.servicio_documentos_extra ADD COLUMN IF NOT EXISTS size_bytes bigint'],
    ARRAY['servicio_documentos_extra', 'ALTER TABLE public.servicio_documentos_extra ADD COLUMN IF NOT EXISTS datos jsonb DEFAULT ''{}''::jsonb'],
    ARRAY['servicio_documentos_extra', 'ALTER TABLE public.servicio_documentos_extra ADD COLUMN IF NOT EXISTS url text'],
    ARRAY['servicio_documentos_extra', 'ALTER TABLE public.servicio_documentos_extra ADD COLUMN IF NOT EXISTS archivo_nombre text'],
    ARRAY['servicio_documentos_extra', 'ALTER TABLE public.servicio_documentos_extra ADD COLUMN IF NOT EXISTS creado_por uuid']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(alters, 1) LOOP
    t := alters[i][1];
    ddl := alters[i][2];
    IF public._demo_safe_table_owned('public', t) THEN
      PERFORM public._demo_safe_exec(ddl, 'column ' || t);
    END IF;
  END LOOP;
END;
$$;

-- CHECK estado servicios (pendiente_asignacion)
DO $$
DECLARE
  r record;
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'servicios') THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'servicios'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%estado%'
  LOOP
    PERFORM public._demo_safe_exec(
      format('ALTER TABLE public.servicios DROP CONSTRAINT IF EXISTS %I', r.conname),
      'drop check servicios.estado'
    );
  END LOOP;
END;
$$;

-- =============================================================================
-- 3) Funciones RLS (CREATE OR REPLACE — sin GRANT/REVOKE)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_can_access_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_empresa_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.empresas e
      WHERE e.id = p_empresa_id
        AND e.owner_id IS NOT NULL
        AND e.owner_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_servicio(servicio_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        (s.conductor_id IS NOT NULL AND s.conductor_id = auth.uid())
        OR public.user_can_access_empresa(s.empresa_id)
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          INNER JOIN public.empresas e ON e.id = ce.empresa_id
          WHERE s.conductor_id IS NOT NULL
            AND ce.user_id = s.conductor_id
            AND (ce.activo IS DISTINCT FROM false)
            AND e.owner_id IS NOT NULL
            AND e.owner_id = auth.uid()
        )
      FROM public.servicios s
      WHERE s.id = servicio_uuid
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(p_empresa_id uuid, p_conductor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      public.user_can_access_empresa(p_empresa_id)
      AND (
        p_conductor_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          WHERE ce.empresa_id = p_empresa_id
            AND ce.user_id = p_conductor_id
            AND (ce.activo IS DISTINCT FROM false)
        )
        OR p_conductor_id = auth.uid()
      )
    )
    OR (
      p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND (
        p_empresa_id IS NULL
        OR public.user_can_access_empresa(p_empresa_id)
      )
    )
    OR (
      p_conductor_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.conductor_empresa ce
        INNER JOIN public.empresas e ON e.id = ce.empresa_id
        WHERE ce.user_id = p_conductor_id
          AND (ce.activo IS DISTINCT FROM false)
          AND e.owner_id IS NOT NULL
          AND e.owner_id = auth.uid()
          AND (p_empresa_id IS NULL OR ce.empresa_id = p_empresa_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.documentacion_envios_bi_set_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.enviado_por IS NULL THEN
    NEW.enviado_por := auth.uid();
  END IF;
  IF NEW.empresa_id IS NULL THEN
    SELECT s.empresa_id INTO NEW.empresa_id FROM public.servicios s WHERE s.id = NEW.servicio_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.profiles_enforce_is_archived_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce((auth.jwt() ->> 'role'), '') = 'service_role' THEN
      RETURN NEW;
    END IF;
    NEW.is_archived := false;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF OLD.is_archived IS NOT DISTINCT FROM NEW.is_archived THEN
    RETURN NEW;
  END IF;
  IF coalesce((auth.jwt() ->> 'role'), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'is_archived solo puede modificarse desde administración (service_role)'
    USING ERRCODE = '42501';
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 4) Triggers operativos
-- =============================================================================

DO $$
BEGIN
  IF public._demo_safe_table_owned('public', 'documentacion_envios') THEN
    PERFORM public._demo_safe_exec(
      'DROP TRIGGER IF EXISTS documentacion_envios_bi_set_meta ON public.documentacion_envios',
      'drop trg documentacion_envios'
    );
    PERFORM public._demo_safe_exec(
      $t$CREATE TRIGGER documentacion_envios_bi_set_meta
        BEFORE INSERT ON public.documentacion_envios
        FOR EACH ROW
        EXECUTE PROCEDURE public.documentacion_envios_bi_set_meta()$t$,
      'create trg documentacion_envios'
    );
  END IF;

  IF public._demo_safe_table_owned('public', 'profiles') THEN
    PERFORM public._demo_safe_exec(
      'DROP TRIGGER IF EXISTS tr_profiles_enforce_is_archived ON public.profiles',
      'drop trg profiles'
    );
    PERFORM public._demo_safe_exec(
      $t$CREATE TRIGGER tr_profiles_enforce_is_archived
        BEFORE INSERT OR UPDATE ON public.profiles
        FOR EACH ROW
        EXECUTE PROCEDURE public.profiles_enforce_is_archived_change()$t$,
      'create trg profiles'
    );
  END IF;
END;
$$;

-- =============================================================================
-- 5) RLS + policies operativas (sin GRANT)
-- =============================================================================

DO $$
DECLARE
  ops text[] := ARRAY[
    'servicios', 'stops', 'evidencias', 'empresas', 'conductor_empresa',
    'ubicaciones', 'profiles',
    'servicio_documentos_extra', 'documentacion_envios', 'servicio_asignaciones'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY ops LOOP
    IF public._demo_safe_table_owned('public', t) THEN
      PERFORM public._demo_safe_exec(
        format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t),
        'enable rls ' || t
      );
    END IF;
  END LOOP;
END;
$$;

-- documentacion_envios
DO $$
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'documentacion_envios') THEN RETURN; END IF;
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "de_read_conductor" ON public.documentacion_envios', 'de');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "de_insert_conductor" ON public.documentacion_envios', 'de');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "de_sel" ON public.documentacion_envios', 'de');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "de_ins" ON public.documentacion_envios', 'de');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "de_upd" ON public.documentacion_envios', 'de');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "de_del" ON public.documentacion_envios', 'de');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "de_sel" ON public.documentacion_envios
      FOR SELECT TO authenticated
      USING (public.user_can_access_servicio(servicio_id))
  $p$, 'de_sel');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "de_ins" ON public.documentacion_envios
      FOR INSERT TO authenticated
      WITH CHECK (
        public.user_can_access_servicio(servicio_id)
        AND enviado_por = auth.uid()
      )
  $p$, 'de_ins');
END;
$$;

-- servicio_documentos_extra
DO $$
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'servicio_documentos_extra') THEN RETURN; END IF;
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "sde_read_conductor" ON public.servicio_documentos_extra', 'sde');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "sde_sel" ON public.servicio_documentos_extra', 'sde');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "sde_ins" ON public.servicio_documentos_extra', 'sde');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "sde_upd" ON public.servicio_documentos_extra', 'sde');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "sde_del" ON public.servicio_documentos_extra', 'sde');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "sde_write_conductor" ON public.servicio_documentos_extra', 'sde');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "sde_sel" ON public.servicio_documentos_extra
      FOR SELECT TO authenticated
      USING (public.user_can_access_servicio(servicio_id))
  $p$, 'sde_sel');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "sde_ins" ON public.servicio_documentos_extra
      FOR INSERT TO authenticated
      WITH CHECK (public.user_can_access_servicio(servicio_id))
  $p$, 'sde_ins');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "sde_upd" ON public.servicio_documentos_extra
      FOR UPDATE TO authenticated
      USING (public.user_can_access_servicio(servicio_id))
      WITH CHECK (public.user_can_access_servicio(servicio_id))
  $p$, 'sde_upd');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "sde_del" ON public.servicio_documentos_extra
      FOR DELETE TO authenticated
      USING (public.user_can_access_servicio(servicio_id))
  $p$, 'sde_del');
END;
$$;

-- servicios (reemplazar políticas legacy)
DO $$
DECLARE
  pol record;
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'servicios') THEN RETURN; END IF;
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'servicios'
  LOOP
    PERFORM public._demo_safe_exec(
      format('DROP POLICY IF EXISTS %I ON public.servicios', pol.policyname),
      'drop srv pol ' || pol.policyname
    );
  END LOOP;
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "srv_sel" ON public.servicios
      FOR SELECT TO authenticated
      USING (public.user_can_access_servicio(id))
  $p$, 'srv_sel');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "srv_ins" ON public.servicios
      FOR INSERT TO authenticated
      WITH CHECK (public.user_can_insert_servicio(empresa_id, conductor_id))
  $p$, 'srv_ins');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "srv_upd" ON public.servicios
      FOR UPDATE TO authenticated
      USING (public.user_can_access_servicio(id))
      WITH CHECK (public.user_can_access_servicio(id))
  $p$, 'srv_upd');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "srv_del" ON public.servicios
      FOR DELETE TO authenticated
      USING (public.user_can_access_servicio(id))
  $p$, 'srv_del');
END;
$$;

-- stops
DO $$
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'stops') THEN RETURN; END IF;
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "stp_sel" ON public.stops', 'stp');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "stp_ins" ON public.stops', 'stp');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "stp_upd" ON public.stops', 'stp');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "stp_del" ON public.stops', 'stp');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "stp_sel" ON public.stops
      FOR SELECT TO authenticated
      USING (public.user_can_access_servicio(servicio_id))
  $p$, 'stp_sel');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "stp_ins" ON public.stops
      FOR INSERT TO authenticated
      WITH CHECK (public.user_can_access_servicio(servicio_id))
  $p$, 'stp_ins');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "stp_upd" ON public.stops
      FOR UPDATE TO authenticated
      USING (public.user_can_access_servicio(servicio_id))
      WITH CHECK (public.user_can_access_servicio(servicio_id))
  $p$, 'stp_upd');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "stp_del" ON public.stops
      FOR DELETE TO authenticated
      USING (public.user_can_access_servicio(servicio_id))
  $p$, 'stp_del');
END;
$$;

-- evidencias
DO $$
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'evidencias') THEN RETURN; END IF;
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ev_sel" ON public.evidencias', 'ev');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ev_ins" ON public.evidencias', 'ev');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ev_upd" ON public.evidencias', 'ev');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ev_del" ON public.evidencias', 'ev');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ev_sel" ON public.evidencias
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.stops st
          WHERE st.id = evidencias.stop_id
            AND public.user_can_access_servicio(st.servicio_id)
        )
      )
  $p$, 'ev_sel');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ev_ins" ON public.evidencias
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.stops st
          WHERE st.id = evidencias.stop_id
            AND public.user_can_access_servicio(st.servicio_id)
        )
      )
  $p$, 'ev_ins');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ev_upd" ON public.evidencias
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.stops st
          WHERE st.id = evidencias.stop_id
            AND public.user_can_access_servicio(st.servicio_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.stops st
          WHERE st.id = evidencias.stop_id
            AND public.user_can_access_servicio(st.servicio_id)
        )
      )
  $p$, 'ev_upd');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ev_del" ON public.evidencias
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.stops st
          WHERE st.id = evidencias.stop_id
            AND public.user_can_access_servicio(st.servicio_id)
        )
      )
  $p$, 'ev_del');
END;
$$;

-- empresas
DO $$
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'empresas') THEN RETURN; END IF;
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "emp_sel" ON public.empresas', 'emp');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "emp_ins" ON public.empresas', 'emp');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "emp_upd" ON public.empresas', 'emp');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "emp_del" ON public.empresas', 'emp');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "emp_sel" ON public.empresas
      FOR SELECT TO authenticated USING (owner_id = auth.uid())
  $p$, 'emp_sel');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "emp_ins" ON public.empresas
      FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid())
  $p$, 'emp_ins');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "emp_upd" ON public.empresas
      FOR UPDATE TO authenticated
      USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())
  $p$, 'emp_upd');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "emp_del" ON public.empresas
      FOR DELETE TO authenticated USING (owner_id = auth.uid())
  $p$, 'emp_del');
END;
$$;

-- conductor_empresa
DO $$
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'conductor_empresa') THEN RETURN; END IF;
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ce_sel" ON public.conductor_empresa', 'ce');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ce_ins" ON public.conductor_empresa', 'ce');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ce_upd" ON public.conductor_empresa', 'ce');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ce_del" ON public.conductor_empresa', 'ce');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ce_sel" ON public.conductor_empresa
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.empresas e
          WHERE e.id = empresa_id AND e.owner_id = auth.uid()
        )
      )
  $p$, 'ce_sel');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ce_ins" ON public.conductor_empresa
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.empresas e
          WHERE e.id = empresa_id AND e.owner_id = auth.uid()
        )
        OR (
          user_id = auth.uid()
          AND EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id)
        )
      )
  $p$, 'ce_ins');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ce_upd" ON public.conductor_empresa
      FOR UPDATE TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid())
      )
      WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid())
      )
  $p$, 'ce_upd');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ce_del" ON public.conductor_empresa
      FOR DELETE TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid())
      )
  $p$, 'ce_del');
END;
$$;

-- ubicaciones
DO $$
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'ubicaciones') THEN RETURN; END IF;
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ubi_sel" ON public.ubicaciones', 'ubi');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ubi_ins" ON public.ubicaciones', 'ubi');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ubi_upd" ON public.ubicaciones', 'ubi');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ubi_del" ON public.ubicaciones', 'ubi');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "ubi_sel_empresa_flota" ON public.ubicaciones', 'ubi');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ubi_sel" ON public.ubicaciones
      FOR SELECT TO authenticated USING (user_id = auth.uid())
  $p$, 'ubi_sel');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ubi_ins" ON public.ubicaciones
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())
  $p$, 'ubi_ins');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ubi_upd" ON public.ubicaciones
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
  $p$, 'ubi_upd');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ubi_del" ON public.ubicaciones
      FOR DELETE TO authenticated USING (user_id = auth.uid())
  $p$, 'ubi_del');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "ubi_sel_empresa_flota" ON public.ubicaciones
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          INNER JOIN public.empresas e ON e.id = ce.empresa_id AND e.owner_id = auth.uid()
          WHERE ce.user_id = ubicaciones.user_id
            AND (ce.activo IS DISTINCT FROM false)
        )
      )
  $p$, 'ubi_sel_empresa_flota');
END;
$$;

-- profiles
DO $$
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'profiles') THEN RETURN; END IF;
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "prof_sel" ON public.profiles', 'prof');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "prof_ins" ON public.profiles', 'prof');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "prof_upd" ON public.profiles', 'prof');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "prof_del" ON public.profiles', 'prof');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "prof_sel" ON public.profiles
      FOR SELECT TO authenticated
      USING (
        id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          INNER JOIN public.empresas e ON e.id = ce.empresa_id
          WHERE ce.user_id = profiles.id
            AND (ce.activo IS DISTINCT FROM false)
            AND e.owner_id = auth.uid()
        )
      )
  $p$, 'prof_sel');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "prof_ins" ON public.profiles
      FOR INSERT TO authenticated WITH CHECK (id = auth.uid())
  $p$, 'prof_ins');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "prof_upd" ON public.profiles
      FOR UPDATE TO authenticated
      USING (id = auth.uid()) WITH CHECK (id = auth.uid())
  $p$, 'prof_upd');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "prof_del" ON public.profiles
      FOR DELETE TO authenticated USING (id = auth.uid())
  $p$, 'prof_del');
END;
$$;

-- servicio_asignaciones
DO $$
BEGIN
  IF NOT public._demo_safe_table_owned('public', 'servicio_asignaciones') THEN RETURN; END IF;
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "sa_sel" ON public.servicio_asignaciones', 'sa');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "sa_ins" ON public.servicio_asignaciones', 'sa');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "sa_upd" ON public.servicio_asignaciones', 'sa');
  PERFORM public._demo_safe_exec('DROP POLICY IF EXISTS "sa_del" ON public.servicio_asignaciones', 'sa');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "sa_sel" ON public.servicio_asignaciones
      FOR SELECT TO authenticated
      USING (public.user_can_access_servicio(servicio_id))
  $p$, 'sa_sel');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "sa_ins" ON public.servicio_asignaciones
      FOR INSERT TO authenticated
      WITH CHECK (public.user_can_access_servicio(servicio_id))
  $p$, 'sa_ins');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "sa_upd" ON public.servicio_asignaciones
      FOR UPDATE TO authenticated
      USING (public.user_can_access_servicio(servicio_id))
      WITH CHECK (public.user_can_access_servicio(servicio_id))
  $p$, 'sa_upd');
  PERFORM public._demo_safe_exec($p$
    CREATE POLICY "sa_del" ON public.servicio_asignaciones
      FOR DELETE TO authenticated
      USING (public.user_can_access_servicio(servicio_id))
  $p$, 'sa_del');
END;
$$;

-- =============================================================================
-- 6) Storage buckets + policies (sin ALTER TABLE storage.objects)
-- =============================================================================

SELECT public._demo_safe_exec($sql$
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-photos', 'user-photos', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public
$sql$, 'bucket user-photos');

SELECT public._demo_safe_exec($sql$
INSERT INTO storage.buckets (id, name, public)
VALUES ('cmr', 'cmr', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public
$sql$, 'bucket cmr');

SELECT public._demo_safe_exec($sql$
UPDATE storage.buckets SET public = false
WHERE name IN ('user-photos', 'cmr') OR id::text IN ('user-photos', 'cmr')
$sql$, 'buckets private');

DO $$
BEGIN
  PERFORM public._demo_safe_exec('ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY', 'storage rls');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[demo-safe] storage.objects RLS omitido: %', SQLERRM;
END;
$$;

-- user-photos policies
SELECT public._demo_safe_exec('DROP POLICY IF EXISTS "stor_uph_sel_own" ON storage.objects', 'stor_uph');
SELECT public._demo_safe_exec('DROP POLICY IF EXISTS "stor_uph_sel_fleet" ON storage.objects', 'stor_uph');
SELECT public._demo_safe_exec('DROP POLICY IF EXISTS "stor_uph_ins" ON storage.objects', 'stor_uph');
SELECT public._demo_safe_exec('DROP POLICY IF EXISTS "stor_uph_upd" ON storage.objects', 'stor_uph');
SELECT public._demo_safe_exec('DROP POLICY IF EXISTS "stor_uph_del" ON storage.objects', 'stor_uph');

SELECT public._demo_safe_exec($p$
CREATE POLICY "stor_uph_sel_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_sel_own');

SELECT public._demo_safe_exec($p$
CREATE POLICY "stor_uph_sel_fleet" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      INNER JOIN public.empresas e ON e.id = ce.empresa_id
      WHERE e.owner_id = auth.uid()
        AND ce.user_id::text = split_part(storage.objects.name, '/', 1)
        AND (ce.activo IS DISTINCT FROM false)
    )
  )
$p$, 'stor_uph_sel_fleet');

SELECT public._demo_safe_exec($p$
CREATE POLICY "stor_uph_ins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_ins');

SELECT public._demo_safe_exec($p$
CREATE POLICY "stor_uph_upd" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_upd');

SELECT public._demo_safe_exec($p$
CREATE POLICY "stor_uph_del" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_del');

-- cmr policies
SELECT public._demo_safe_exec('DROP POLICY IF EXISTS "stor_cmr_sel_own" ON storage.objects', 'stor_cmr');
SELECT public._demo_safe_exec('DROP POLICY IF EXISTS "stor_cmr_sel_fleet" ON storage.objects', 'stor_cmr');
SELECT public._demo_safe_exec('DROP POLICY IF EXISTS "stor_cmr_ins" ON storage.objects', 'stor_cmr');
SELECT public._demo_safe_exec('DROP POLICY IF EXISTS "stor_cmr_upd" ON storage.objects', 'stor_cmr');
SELECT public._demo_safe_exec('DROP POLICY IF EXISTS "stor_cmr_del" ON storage.objects', 'stor_cmr');

SELECT public._demo_safe_exec($p$
CREATE POLICY "stor_cmr_sel_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_sel_own');

SELECT public._demo_safe_exec($p$
CREATE POLICY "stor_cmr_sel_fleet" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      INNER JOIN public.empresas e ON e.id = ce.empresa_id
      WHERE e.owner_id = auth.uid()
        AND ce.user_id::text = split_part(storage.objects.name, '/', 1)
        AND (ce.activo IS DISTINCT FROM false)
    )
  )
$p$, 'stor_cmr_sel_fleet');

SELECT public._demo_safe_exec($p$
CREATE POLICY "stor_cmr_ins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_ins');

SELECT public._demo_safe_exec($p$
CREATE POLICY "stor_cmr_upd" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_upd');

SELECT public._demo_safe_exec($p$
CREATE POLICY "stor_cmr_del" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_del');

-- =============================================================================
-- Fin — revisa NOTICE en el panel SQL si alguna tabla se omitió por ownership
-- =============================================================================
