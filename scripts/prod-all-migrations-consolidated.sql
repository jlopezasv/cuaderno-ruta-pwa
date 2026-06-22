-- =============================================================================
-- PRODUCCIÓN REAL — todas las migraciones (sin solo-demo / sin debug)
-- Proyecto: glyexutcypmhkndvmcxd (cuadernoderutapro.es / tacografo-pro)
-- Generado: 2026-06-22 — node scripts/build-prod-all-migrations.mjs
--
-- EXCLUIDO a propósito:
--   debug_servicio_insert_rls_context*
--   *_demo.sql (salvo SQL DeCA/remolque/deca_public_id incluidos aquí)
--   storage.objects directo → scripts/prod-storage-and-legacy-rls-safe.sql
--   demo_office_* / office insert RLS solo demo
--   service_messages, viaje_codigo, multi_deca_cargador, participacion_tipo
--   seeds y scripts repair-*
--
-- USO:
--   1. Ejecutar scripts/preflight-prod-sql-audit.sql y revisar FALTA
--   2. En proyecto REAL vacío o desactualizado: pegar TODO este archivo
--   3. En REAL ya parcialmente migrado: idempotente — solo aplica lo que falte
--
-- ORDEN: 50 bloques (no reordenar)
-- =============================================================================



-- >>> FILE: supabase/migrations/20260513120000_servicio_extra_docs_mail.sql

-- Documentación extra por servicio (no ligada a stop) + historial de envíos por email.
-- Ejecutar en Supabase SQL Editor si no usas migraciones CLI.
-- RLS unificada por servicio + función user_can_access_servicio: aplicar también
-- supabase/migrations/20260514120000_rls_servicio_ownership_core.sql

CREATE TABLE IF NOT EXISTS public.servicio_documentos_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descripcion text,
  url text,
  archivo_nombre text,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_extra_servicio
  ON public.servicio_documentos_extra (servicio_id);

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
);

CREATE INDEX IF NOT EXISTS idx_documentacion_envios_servicio
  ON public.documentacion_envios (servicio_id);

ALTER TABLE public.servicio_documentos_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentacion_envios ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para usuarios autenticados con rol en el servicio (conductor).
-- Ajustar si usáis RLS más estricta por empresa.
DROP POLICY IF EXISTS "sde_read_conductor" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_sel" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_ins" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_upd" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_del" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_write_conductor" ON public.servicio_documentos_extra;
CREATE POLICY "sde_sel" ON public.servicio_documentos_extra
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );
CREATE POLICY "sde_ins" ON public.servicio_documentos_extra
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );
CREATE POLICY "sde_upd" ON public.servicio_documentos_extra
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );
CREATE POLICY "sde_del" ON public.servicio_documentos_extra
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "de_read_conductor" ON public.documentacion_envios;
CREATE POLICY "de_read_conductor" ON public.documentacion_envios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "de_insert_conductor" ON public.documentacion_envios;
CREATE POLICY "de_insert_conductor" ON public.documentacion_envios
  FOR INSERT TO authenticated
  WITH CHECK (
    enviado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id AND s.conductor_id = auth.uid()
    )
  );

-- <<< END supabase/migrations/20260513120000_servicio_extra_docs_mail.sql


-- >>> FILE: supabase/migrations/20260514120000_rls_servicio_ownership_core.sql

-- =============================================================================
-- RLS + ownership centrado en SERVICIO (conductor vs empresa, dos productos).
-- Depende de: public.servicios (conductor_id, empresa_id), public.empresas (owner_id).
--
-- Ejecutar tras backup. Revisa políticas previas con el mismo nombre (idempotente).
-- Futuro (sin implementar): empresa_users, operadores, admins — ampliar
--   public.user_can_access_servicio(uuid) o delegar a vista de membresía.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Función única de acceso a servicio (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
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
        OR (
          s.empresa_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.empresas e
            WHERE e.id = s.empresa_id
              AND e.owner_id IS NOT NULL
              AND e.owner_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          INNER JOIN public.empresas e ON e.id = ce.empresa_id
          WHERE s.conductor_id IS NOT NULL
            AND ce.user_id = s.conductor_id
            AND (ce.activo IS DISTINCT FROM false)
            AND e.owner_id = auth.uid()
        )
      FROM public.servicios s
      WHERE s.id = servicio_uuid
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.user_can_access_servicio(uuid) IS
  'True si auth.uid() es conductor del servicio; o propietario de la empresa del servicio (empresa_id); '
  'o propietario de la empresa a la que pertenece el conductor asignado (conductor_empresa). '
  'No sustituye validaciones de negocio en API; extender para empresa_users / admins.';

REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) documentacion_envios — append-only + auditoría empresa_id
-- -----------------------------------------------------------------------------
ALTER TABLE public.documentacion_envios
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL;

UPDATE public.documentacion_envios d
SET empresa_id = s.empresa_id
FROM public.servicios s
WHERE d.servicio_id = s.id
  AND d.empresa_id IS NULL
  AND s.empresa_id IS NOT NULL;

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

REVOKE ALL ON FUNCTION public.documentacion_envios_bi_set_meta() FROM PUBLIC;

DROP TRIGGER IF EXISTS documentacion_envios_bi_set_meta ON public.documentacion_envios;
CREATE TRIGGER documentacion_envios_bi_set_meta
  BEFORE INSERT ON public.documentacion_envios
  FOR EACH ROW
  EXECUTE PROCEDURE public.documentacion_envios_bi_set_meta();

COMMENT ON TABLE public.documentacion_envios IS
  'Historial de envíos de documentación (expediente). APPEND-ONLY para authenticated: solo SELECT/INSERT.';

ALTER TABLE public.documentacion_envios ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.documentacion_envios TO authenticated;
GRANT ALL ON public.documentacion_envios TO service_role;
REVOKE UPDATE, DELETE ON public.documentacion_envios FROM authenticated;

DROP POLICY IF EXISTS "de_read_conductor" ON public.documentacion_envios;
DROP POLICY IF EXISTS "de_insert_conductor" ON public.documentacion_envios;
DROP POLICY IF EXISTS "de_sel" ON public.documentacion_envios;
DROP POLICY IF EXISTS "de_ins" ON public.documentacion_envios;
DROP POLICY IF EXISTS "de_upd" ON public.documentacion_envios;
DROP POLICY IF EXISTS "de_del" ON public.documentacion_envios;

CREATE POLICY "de_sel" ON public.documentacion_envios
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "de_ins" ON public.documentacion_envios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_servicio(servicio_id)
    AND enviado_por = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 3) servicio_documentos_extra (expediente documental del viaje, no evidencias de parada)
-- -----------------------------------------------------------------------------
ALTER TABLE public.servicio_documentos_extra ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicio_documentos_extra TO authenticated;
GRANT ALL ON public.servicio_documentos_extra TO service_role;

DROP POLICY IF EXISTS "sde_read_conductor" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_sel" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_ins" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_upd" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_del" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_write_conductor" ON public.servicio_documentos_extra;

CREATE POLICY "sde_sel" ON public.servicio_documentos_extra
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sde_ins" ON public.servicio_documentos_extra
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sde_upd" ON public.servicio_documentos_extra
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(servicio_id))
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sde_del" ON public.servicio_documentos_extra
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

-- -----------------------------------------------------------------------------
-- 4) servicios
-- -----------------------------------------------------------------------------
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicios TO authenticated;
GRANT ALL ON public.servicios TO service_role;

DROP POLICY IF EXISTS "srv_sel" ON public.servicios;
DROP POLICY IF EXISTS "srv_ins" ON public.servicios;
DROP POLICY IF EXISTS "srv_upd" ON public.servicios;
DROP POLICY IF EXISTS "srv_del" ON public.servicios;

CREATE POLICY "srv_sel" ON public.servicios
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(id));

CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (
    (empresa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = empresa_id AND e.owner_id = auth.uid()
    ))
    OR (empresa_id IS NULL AND conductor_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      INNER JOIN public.empresas e ON e.id = ce.empresa_id
      WHERE ce.user_id = conductor_id
        AND (ce.activo IS DISTINCT FROM false)
        AND e.owner_id = auth.uid()
    )
  );

CREATE POLICY "srv_upd" ON public.servicios
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(id))
  WITH CHECK (public.user_can_access_servicio(id));

CREATE POLICY "srv_del" ON public.servicios
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(id));

-- -----------------------------------------------------------------------------
-- 5) stops (paradas ligadas a servicio)
-- -----------------------------------------------------------------------------
ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stops TO authenticated;
GRANT ALL ON public.stops TO service_role;

DROP POLICY IF EXISTS "stp_sel" ON public.stops;
DROP POLICY IF EXISTS "stp_ins" ON public.stops;
DROP POLICY IF EXISTS "stp_upd" ON public.stops;
DROP POLICY IF EXISTS "stp_del" ON public.stops;

CREATE POLICY "stp_sel" ON public.stops
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "stp_ins" ON public.stops
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "stp_upd" ON public.stops
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(servicio_id))
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "stp_del" ON public.stops
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

-- -----------------------------------------------------------------------------
-- 6) evidencias (documentación operativa por parada: CMR, foto, incidencia…)
-- -----------------------------------------------------------------------------
ALTER TABLE public.evidencias ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidencias TO authenticated;
GRANT ALL ON public.evidencias TO service_role;

DROP POLICY IF EXISTS "ev_sel" ON public.evidencias;
DROP POLICY IF EXISTS "ev_ins" ON public.evidencias;
DROP POLICY IF EXISTS "ev_upd" ON public.evidencias;
DROP POLICY IF EXISTS "ev_del" ON public.evidencias;

CREATE POLICY "ev_sel" ON public.evidencias
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
  );

CREATE POLICY "ev_ins" ON public.evidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
  );

CREATE POLICY "ev_upd" ON public.evidencias
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
  );

CREATE POLICY "ev_del" ON public.evidencias
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stops st
      WHERE st.id = evidencias.stop_id
        AND public.user_can_access_servicio(st.servicio_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 7) asignaciones (si existe en el proyecto)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'asignaciones'
  ) THEN
    EXECUTE 'ALTER TABLE public.asignaciones ENABLE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.asignaciones TO authenticated';
    EXECUTE 'GRANT ALL ON public.asignaciones TO service_role';
    EXECUTE 'DROP POLICY IF EXISTS "as_sel" ON public.asignaciones';
    EXECUTE 'DROP POLICY IF EXISTS "as_ins" ON public.asignaciones';
    EXECUTE 'DROP POLICY IF EXISTS "as_upd" ON public.asignaciones';
    EXECUTE 'DROP POLICY IF EXISTS "as_del" ON public.asignaciones';
    EXECUTE $p$
      CREATE POLICY "as_sel" ON public.asignaciones
        FOR SELECT TO authenticated
        USING (public.user_can_access_servicio(servicio_id))
    $p$;
    EXECUTE $p$
      CREATE POLICY "as_ins" ON public.asignaciones
        FOR INSERT TO authenticated
        WITH CHECK (public.user_can_access_servicio(servicio_id))
    $p$;
    EXECUTE $p$
      CREATE POLICY "as_upd" ON public.asignaciones
        FOR UPDATE TO authenticated
        USING (public.user_can_access_servicio(servicio_id))
        WITH CHECK (public.user_can_access_servicio(servicio_id))
    $p$;
    EXECUTE $p$
      CREATE POLICY "as_del" ON public.asignaciones
        FOR DELETE TO authenticated
        USING (public.user_can_access_servicio(servicio_id))
    $p$;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8) empresas (solo propietario)
-- -----------------------------------------------------------------------------
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;

DROP POLICY IF EXISTS "emp_sel" ON public.empresas;
DROP POLICY IF EXISTS "emp_ins" ON public.empresas;
DROP POLICY IF EXISTS "emp_upd" ON public.empresas;
DROP POLICY IF EXISTS "emp_del" ON public.empresas;

CREATE POLICY "emp_sel" ON public.empresas
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "emp_ins" ON public.empresas
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "emp_upd" ON public.empresas
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "emp_del" ON public.empresas
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 9) conductor_empresa (flota: propietario ve todo; conductor ve sus filas)
-- -----------------------------------------------------------------------------
ALTER TABLE public.conductor_empresa ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conductor_empresa TO authenticated;
GRANT ALL ON public.conductor_empresa TO service_role;

DROP POLICY IF EXISTS "ce_sel" ON public.conductor_empresa;
DROP POLICY IF EXISTS "ce_ins" ON public.conductor_empresa;
DROP POLICY IF EXISTS "ce_upd" ON public.conductor_empresa;
DROP POLICY IF EXISTS "ce_del" ON public.conductor_empresa;

CREATE POLICY "ce_sel" ON public.conductor_empresa
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = empresa_id AND e.owner_id = auth.uid()
    )
  );

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
  );

CREATE POLICY "ce_upd" ON public.conductor_empresa
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = empresa_id AND e.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = empresa_id AND e.owner_id = auth.uid()
    )
  );

CREATE POLICY "ce_del" ON public.conductor_empresa
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = empresa_id AND e.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 10) ubicaciones (solo el propio usuario)
-- -----------------------------------------------------------------------------
ALTER TABLE public.ubicaciones ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ubicaciones TO authenticated;
GRANT ALL ON public.ubicaciones TO service_role;

DROP POLICY IF EXISTS "ubi_sel" ON public.ubicaciones;
DROP POLICY IF EXISTS "ubi_ins" ON public.ubicaciones;
DROP POLICY IF EXISTS "ubi_upd" ON public.ubicaciones;
DROP POLICY IF EXISTS "ubi_del" ON public.ubicaciones;

CREATE POLICY "ubi_sel" ON public.ubicaciones
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "ubi_ins" ON public.ubicaciones
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ubi_upd" ON public.ubicaciones
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ubi_del" ON public.ubicaciones
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 11) profiles (perfil propio + lectura de conductores vinculados a mi empresa)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

DROP POLICY IF EXISTS "prof_sel" ON public.profiles;
DROP POLICY IF EXISTS "prof_ins" ON public.profiles;
DROP POLICY IF EXISTS "prof_upd" ON public.profiles;
DROP POLICY IF EXISTS "prof_del" ON public.profiles;

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
  );

CREATE POLICY "prof_ins" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "prof_upd" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "prof_del" ON public.profiles
  FOR DELETE TO authenticated
  USING (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 12) push_tokens (solo filas propias)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'push_tokens'
  ) THEN
    EXECUTE 'ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated';
    EXECUTE 'GRANT ALL ON public.push_tokens TO service_role';
    EXECUTE 'DROP POLICY IF EXISTS "pt_sel" ON public.push_tokens';
    EXECUTE 'DROP POLICY IF EXISTS "pt_ins" ON public.push_tokens';
    EXECUTE 'DROP POLICY IF EXISTS "pt_upd" ON public.push_tokens';
    EXECUTE 'DROP POLICY IF EXISTS "pt_del" ON public.push_tokens';
    EXECUTE $p$
      CREATE POLICY "pt_sel" ON public.push_tokens
        FOR SELECT TO authenticated
        USING (user_id = auth.uid())
    $p$;
    EXECUTE $p$
      CREATE POLICY "pt_ins" ON public.push_tokens
        FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid())
    $p$;
    EXECUTE $p$
      CREATE POLICY "pt_upd" ON public.push_tokens
        FOR UPDATE TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
    $p$;
    EXECUTE $p$
      CREATE POLICY "pt_del" ON public.push_tokens
        FOR DELETE TO authenticated
        USING (user_id = auth.uid())
    $p$;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 13) Comentarios de modelo (operativa vs expediente)
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.evidencias IS
  'Documentación operativa por parada (CMR escaneado, fotos en muelle, incidencias in situ, notas). '
  'Separación conceptual obligatoria frente a servicio_documentos_extra (expediente del viaje).';

COMMENT ON TABLE public.servicio_documentos_extra IS
  'Expediente documental del viaje: tickets, PDFs externos, fotos adicionales no ligadas a una parada concreta. '
  'No mezclar con evidencias (checklist operacional por stop).';

-- <<< END supabase/migrations/20260514120000_rls_servicio_ownership_core.sql


-- >>> FILE: scripts/prod-storage-and-legacy-rls-safe.sql

-- =============================================================================
-- PRODUCCIÓN: storage (user-photos, cmr) + RLS legacy — sin exigir owner de
-- storage.objects (error 42501 en SQL Editor de Supabase).
-- Equivalente a 20260515190000_storage_and_legacy_rls.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public._prod_safe_exec(p_sql text, p_label text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN
    RAISE NOTICE '[prod-safe skip %] %', coalesce(p_label, '?'), SQLERRM;
  WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      RAISE NOTICE '[prod-safe skip %] %', coalesce(p_label, '?'), SQLERRM;
    ELSE
      RAISE;
    END IF;
END;
$$;

-- Buckets privados (no requiere owner de objects)
SELECT public._prod_safe_exec($sql$
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-photos', 'user-photos', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public
$sql$, 'bucket user-photos');

SELECT public._prod_safe_exec($sql$
INSERT INTO storage.buckets (id, name, public)
VALUES ('cmr', 'cmr', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public
$sql$, 'bucket cmr');

SELECT public._prod_safe_exec($sql$
UPDATE storage.buckets
SET public = false
WHERE name IN ('user-photos', 'cmr')
   OR id::text IN ('user-photos', 'cmr')
$sql$, 'buckets private');

SELECT public._prod_safe_exec(
  'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY',
  'storage.objects RLS'
);

-- user-photos
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_uph_sel_own" ON storage.objects', 'stor_uph');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_uph_sel_fleet" ON storage.objects', 'stor_uph');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_uph_ins" ON storage.objects', 'stor_uph');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_uph_upd" ON storage.objects', 'stor_uph');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_uph_del" ON storage.objects', 'stor_uph');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_uph_sel_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_sel_own');

SELECT public._prod_safe_exec($p$
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

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_uph_ins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_ins');

SELECT public._prod_safe_exec($p$
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

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_uph_del" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_uph_del');

-- cmr
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_cmr_sel_own" ON storage.objects', 'stor_cmr');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_cmr_sel_fleet" ON storage.objects', 'stor_cmr');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_cmr_ins" ON storage.objects', 'stor_cmr');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_cmr_upd" ON storage.objects', 'stor_cmr');
SELECT public._prod_safe_exec('DROP POLICY IF EXISTS "stor_cmr_del" ON storage.objects', 'stor_cmr');

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_cmr_sel_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_sel_own');

SELECT public._prod_safe_exec($p$
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

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_cmr_ins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_ins');

SELECT public._prod_safe_exec($p$
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

SELECT public._prod_safe_exec($p$
CREATE POLICY "stor_cmr_del" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
$p$, 'stor_cmr_del');

-- Legacy: solo si existe columna user_id
DO $$
BEGIN
  IF to_regclass('public.entries') IS NOT NULL THEN
    ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
    GRANT ALL ON public.entries TO service_role;
    DROP POLICY IF EXISTS entries_own_sel ON public.entries;
    DROP POLICY IF EXISTS entries_own_ins ON public.entries;
    DROP POLICY IF EXISTS entries_own_upd ON public.entries;
    DROP POLICY IF EXISTS entries_own_del ON public.entries;
    CREATE POLICY entries_own_sel ON public.entries FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY entries_own_ins ON public.entries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY entries_own_upd ON public.entries FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY entries_own_del ON public.entries FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.gastos') IS NOT NULL THEN
    ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos TO authenticated;
    GRANT ALL ON public.gastos TO service_role;
    DROP POLICY IF EXISTS gastos_own_sel ON public.gastos;
    DROP POLICY IF EXISTS gastos_own_ins ON public.gastos;
    DROP POLICY IF EXISTS gastos_own_upd ON public.gastos;
    DROP POLICY IF EXISTS gastos_own_del ON public.gastos;
    CREATE POLICY gastos_own_sel ON public.gastos FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY gastos_own_ins ON public.gastos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY gastos_own_upd ON public.gastos FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY gastos_own_del ON public.gastos FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.km_logs') IS NOT NULL THEN
    ALTER TABLE public.km_logs ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.km_logs TO authenticated;
    GRANT ALL ON public.km_logs TO service_role;
    DROP POLICY IF EXISTS km_logs_own_sel ON public.km_logs;
    DROP POLICY IF EXISTS km_logs_own_ins ON public.km_logs;
    DROP POLICY IF EXISTS km_logs_own_upd ON public.km_logs;
    DROP POLICY IF EXISTS km_logs_own_del ON public.km_logs;
    CREATE POLICY km_logs_own_sel ON public.km_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY km_logs_own_ins ON public.km_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY km_logs_own_upd ON public.km_logs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY km_logs_own_del ON public.km_logs FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.cmr_docs') IS NOT NULL THEN
    ALTER TABLE public.cmr_docs ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.cmr_docs TO authenticated;
    GRANT ALL ON public.cmr_docs TO service_role;
    DROP POLICY IF EXISTS cmr_docs_own_sel ON public.cmr_docs;
    DROP POLICY IF EXISTS cmr_docs_own_ins ON public.cmr_docs;
    DROP POLICY IF EXISTS cmr_docs_own_upd ON public.cmr_docs;
    DROP POLICY IF EXISTS cmr_docs_own_del ON public.cmr_docs;
    CREATE POLICY cmr_docs_own_sel ON public.cmr_docs FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY cmr_docs_own_ins ON public.cmr_docs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY cmr_docs_own_upd ON public.cmr_docs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY cmr_docs_own_del ON public.cmr_docs FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
    GRANT ALL ON public.subscriptions TO service_role;
    DROP POLICY IF EXISTS subscriptions_own_sel ON public.subscriptions;
    DROP POLICY IF EXISTS subscriptions_own_ins ON public.subscriptions;
    DROP POLICY IF EXISTS subscriptions_own_upd ON public.subscriptions;
    DROP POLICY IF EXISTS subscriptions_own_del ON public.subscriptions;
    CREATE POLICY subscriptions_own_sel ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY subscriptions_own_ins ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY subscriptions_own_upd ON public.subscriptions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY subscriptions_own_del ON public.subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END;
$$;

-- <<< END scripts/prod-storage-and-legacy-rls-safe.sql


-- >>> FILE: supabase/migrations/20260516120000_profiles_is_archived.sql

-- Archivado lógico de perfiles (conductores/usuarios): evita DELETE y FK rotas.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_archived IS
  'Si true: oculto en listados operativos y sin uso de app; mantiene id y relaciones (servicios, evidencias, etc.).';

UPDATE public.profiles SET is_archived = false WHERE is_archived IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_list
  ON public.profiles (updated_at DESC)
  WHERE (is_archived = false);

-- Solo el backend (JWT role service_role) puede cambiar is_archived.
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

REVOKE ALL ON FUNCTION public.profiles_enforce_is_archived_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_profiles_enforce_is_archived ON public.profiles;
CREATE TRIGGER tr_profiles_enforce_is_archived
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_enforce_is_archived_change();

-- <<< END supabase/migrations/20260516120000_profiles_is_archived.sql


-- >>> FILE: supabase/migrations/20260517130000_ubicaciones_operativa_columns.sql

-- Contexto operativo en la fila "viva" de ubicaciones (una por user_id).
-- La unicidad por user_id se mantiene; el cliente usa UPSERT (on_conflict=user_id).

DO $$
BEGIN
  IF to_regclass('public.ubicaciones') IS NULL THEN
    RAISE NOTICE 'ubicaciones: tabla no existe, se omite migración';
    RETURN;
  END IF;

  ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL;
  ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS servicio_id uuid REFERENCES public.servicios (id) ON DELETE SET NULL;
  ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS stop_id uuid REFERENCES public.stops (id) ON DELETE SET NULL;
  ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS event_type text;
END;
$$;

COMMENT ON COLUMN public.ubicaciones.empresa_id IS 'Empresa del servicio activo (tracking operativo).';
COMMENT ON COLUMN public.ubicaciones.servicio_id IS 'Servicio activo asociado al punto GPS.';
COMMENT ON COLUMN public.ubicaciones.stop_id IS 'Parada activa / contexto de evento.';
COMMENT ON COLUMN public.ubicaciones.event_type IS 'Último tipo de evento operativo registrado con este GPS.';

-- <<< END supabase/migrations/20260517130000_ubicaciones_operativa_columns.sql


-- >>> FILE: supabase/migrations/20260518120000_servicios_empresa_id_optional.sql

-- Modo autónomo: servicios pueden existir solo con conductor_id (empresa_id NULL).
-- Idempotente: solo altera si la columna existe y aún es NOT NULL.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'servicios'
      AND column_name = 'empresa_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.servicios ALTER COLUMN empresa_id DROP NOT NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.servicios.empresa_id IS
  'Propiedad secundaria opcional (flota). NULL = servicio del conductor sin empresa vinculada al registro.';

-- <<< END supabase/migrations/20260518120000_servicios_empresa_id_optional.sql


-- >>> FILE: supabase/migrations/20260518140000_empresas_codigo_equipo.sql

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

-- <<< END supabase/migrations/20260518140000_empresas_codigo_equipo.sql


-- >>> FILE: supabase/migrations/20260518160000_revoke_anon_table_grants.sql

-- =============================================================================
-- Endurecer GRANTs: anon sin acceso operativo a tablas internas; authenticated
-- solo DML estándar (sin TRIGGER / REFERENCES / TRUNCATE). service_role total.
--
-- No toca: auth.*, storage.*, realtime publication (privilegios de tabla ≠
-- suscripción Realtime), ni funciones RPC. PostgREST con JWT sigue usando
-- el rol authenticated.
-- =============================================================================

DO $body$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'asignaciones',
    'conductor_empresa',
    'documentos',
    'empresas',
    'entries',
    'evidencias',
    'gastos',
    'parkings',
    'profiles',
    'push_schedule',
    'push_subscriptions',
    'push_tokens',
    'servicios',
    'stops',
    'subscriptions',
    'ubicaciones'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    -- anon: sin lectura ni escritura en tablas de negocio (RLS no sustituye GRANT)
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', tbl);

    -- authenticated: quitar privilegios que una app SaaS no usa en tablas de datos
    EXECUTE format(
      'REVOKE TRIGGER, REFERENCES, TRUNCATE ON TABLE public.%I FROM authenticated',
      tbl
    );

    -- Reafirmar DML para PostgREST / supabase-js (idempotente)
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      tbl
    );

    -- Backend / Edge con service_role
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);
  END LOOP;
END
$body$;

-- Append-only: authenticated solo SELECT + INSERT (reaplicar tras REVOKE ALL implícito no usado aquí)
DO $body$
BEGIN
  IF to_regclass('public.documentacion_envios') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'REVOKE ALL ON TABLE public.documentacion_envios FROM anon';
  EXECUTE 'REVOKE TRIGGER, REFERENCES, TRUNCATE ON TABLE public.documentacion_envios FROM authenticated';
  EXECUTE 'GRANT SELECT, INSERT ON TABLE public.documentacion_envios TO authenticated';
  EXECUTE 'REVOKE UPDATE, DELETE ON TABLE public.documentacion_envios FROM authenticated';
  EXECUTE 'GRANT ALL ON TABLE public.documentacion_envios TO service_role';
END
$body$;

-- Expediente extra por servicio (mismo perfil DML que el resto de tablas operativas)
DO $body$
BEGIN
  IF to_regclass('public.servicio_documentos_extra') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'REVOKE ALL ON TABLE public.servicio_documentos_extra FROM anon';
  EXECUTE 'REVOKE TRIGGER, REFERENCES, TRUNCATE ON TABLE public.servicio_documentos_extra FROM authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.servicio_documentos_extra TO authenticated';
  EXECUTE 'GRANT ALL ON TABLE public.servicio_documentos_extra TO service_role';
END
$body$;

-- <<< END supabase/migrations/20260518160000_revoke_anon_table_grants.sql


-- >>> FILE: supabase/migrations/20260518200000_ubicaciones_select_empresa_flota.sql

-- Jefe de flota: leer ubicaciones GPS de conductores activos de su empresa.
-- Complementa la política ubi_sel (conductor lee la suya). Sin esto el panel empresa
-- no puede leer public.ubicaciones de la flota vía PostgREST.

DROP POLICY IF EXISTS "ubi_sel_empresa_flota" ON public.ubicaciones;

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
  );

-- <<< END supabase/migrations/20260518200000_ubicaciones_select_empresa_flota.sql


-- >>> FILE: supabase/migrations/20260519120000_evidencias_doc_meta.sql

-- Metadatos documentales operativos en evidencias.datos.doc_meta (JSON, sin romper filas existentes).
-- Campos opcionales futuros: columnas dedicadas si hace falta indexar OCR/clasificación.

COMMENT ON COLUMN public.evidencias.datos IS
  'JSON: campos CMR + doc_meta { display_name, size_bytes, preview_url, original_url, mime_type, future_hooks { qr_muelle, check_in_carga, ... } }';

-- <<< END supabase/migrations/20260519120000_evidencias_doc_meta.sql


-- >>> FILE: supabase/migrations/20260519120000_servicio_documentos_extra_schema_align.sql

-- Alineación esquema servicio_documentos_extra: producción (archivo_url, conductor_id) + legacy (url, creado_por).

ALTER TABLE public.servicio_documentos_extra
  ADD COLUMN IF NOT EXISTS stop_id uuid REFERENCES public.stops (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conductor_id uuid,
  ADD COLUMN IF NOT EXISTS archivo_url text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS datos jsonb DEFAULT '{}'::jsonb;

-- Legacy (migración 20260513120000)
ALTER TABLE public.servicio_documentos_extra
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS archivo_nombre text,
  ADD COLUMN IF NOT EXISTS creado_por uuid;

-- Backfill bidireccional si solo existe un lado
UPDATE public.servicio_documentos_extra
SET archivo_url = url
WHERE archivo_url IS NULL AND url IS NOT NULL;

UPDATE public.servicio_documentos_extra
SET url = archivo_url
WHERE url IS NULL AND archivo_url IS NOT NULL;

UPDATE public.servicio_documentos_extra
SET conductor_id = creado_por
WHERE conductor_id IS NULL AND creado_por IS NOT NULL;

UPDATE public.servicio_documentos_extra
SET creado_por = conductor_id
WHERE creado_por IS NULL AND conductor_id IS NOT NULL;

COMMENT ON COLUMN public.servicio_documentos_extra.archivo_url IS 'URL firmada o pública del archivo (canónico en app)';
COMMENT ON COLUMN public.servicio_documentos_extra.url IS 'Legacy — mantener sincronizado con archivo_url';

-- <<< END supabase/migrations/20260519120000_servicio_documentos_extra_schema_align.sql


-- >>> FILE: supabase/migrations/20260520130000_extra_docs_empresa_select.sql

-- Empresa/jefe puede leer documentos extra de servicios a los que tiene acceso.
-- Idempotente: re-aplica políticas con user_can_access_servicio (sustituye solo-conductor).

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
        OR (
          s.empresa_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.empresas e
            WHERE e.id = s.empresa_id
              AND e.owner_id IS NOT NULL
              AND e.owner_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          INNER JOIN public.empresas e ON e.id = ce.empresa_id
          WHERE s.conductor_id IS NOT NULL
            AND ce.user_id = s.conductor_id
            AND (ce.activo IS DISTINCT FROM false)
            AND e.owner_id = auth.uid()
        )
      FROM public.servicios s
      WHERE s.id = servicio_uuid
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;

ALTER TABLE public.servicio_documentos_extra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sde_read_conductor" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_sel" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_ins" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_upd" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_del" ON public.servicio_documentos_extra;
DROP POLICY IF EXISTS "sde_write_conductor" ON public.servicio_documentos_extra;

CREATE POLICY "sde_sel" ON public.servicio_documentos_extra
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sde_ins" ON public.servicio_documentos_extra
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sde_upd" ON public.servicio_documentos_extra
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(servicio_id))
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sde_del" ON public.servicio_documentos_extra
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

-- Relleno empresa_id en filas antiguas (filtros empresa en UI)
UPDATE public.servicio_documentos_extra d
SET empresa_id = s.empresa_id
FROM public.servicios s
WHERE d.servicio_id = s.id
  AND d.empresa_id IS NULL
  AND s.empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_extra_empresa
  ON public.servicio_documentos_extra (empresa_id);

-- <<< END supabase/migrations/20260520130000_extra_docs_empresa_select.sql


-- >>> FILE: supabase/migrations/20260521120000_servicio_sin_conductor_y_asignaciones.sql

-- Servicios sin conductor (planificación empresa) + tabla servicio_asignaciones (relevos futuros).

-- conductor_id opcional en servicios
ALTER TABLE public.servicios
  ALTER COLUMN conductor_id DROP NOT NULL;

COMMENT ON COLUMN public.servicios.conductor_id IS
  'Conductor principal / responsable. NULL = pendiente de asignación (solo empresa hasta asignar).';

-- Tabla de asignaciones por servicio / parada (fase relevos)
CREATE TABLE IF NOT EXISTS public.servicio_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  stop_id uuid REFERENCES public.stops (id) ON DELETE SET NULL,
  conductor_id uuid NOT NULL,
  tipo_asignacion text NOT NULL DEFAULT 'principal',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servicio_asignaciones_servicio
  ON public.servicio_asignaciones (servicio_id);

CREATE INDEX IF NOT EXISTS idx_servicio_asignaciones_stop
  ON public.servicio_asignaciones (stop_id)
  WHERE stop_id IS NOT NULL;

ALTER TABLE public.servicio_asignaciones ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicio_asignaciones TO authenticated;
GRANT ALL ON public.servicio_asignaciones TO service_role;

DROP POLICY IF EXISTS "sa_sel" ON public.servicio_asignaciones;
DROP POLICY IF EXISTS "sa_ins" ON public.servicio_asignaciones;
DROP POLICY IF EXISTS "sa_upd" ON public.servicio_asignaciones;
DROP POLICY IF EXISTS "sa_del" ON public.servicio_asignaciones;

CREATE POLICY "sa_sel" ON public.servicio_asignaciones
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sa_ins" ON public.servicio_asignaciones
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sa_upd" ON public.servicio_asignaciones
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(servicio_id))
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "sa_del" ON public.servicio_asignaciones
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

-- <<< END supabase/migrations/20260521120000_servicio_sin_conductor_y_asignaciones.sql


-- >>> FILE: supabase/migrations/20260521140000_servicios_rls_pendiente_asignacion.sql

-- RLS: permitir al jefe crear/actualizar servicios sin conductor (pendiente_asignacion).
-- Ejecutar en Supabase SQL Editor si falla: new row violates row-level security policy for table "servicios"

-- Acceso a servicio (lectura/paradas/expediente): dueño empresa aunque conductor_id sea NULL
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
        OR (
          s.empresa_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.empresas e
            WHERE e.id = s.empresa_id
              AND e.owner_id IS NOT NULL
              AND e.owner_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          INNER JOIN public.empresas e ON e.id = ce.empresa_id
          WHERE s.conductor_id IS NOT NULL
            AND ce.user_id = s.conductor_id
            AND (ce.activo IS DISTINCT FROM false)
            AND e.owner_id = auth.uid()
        )
      FROM public.servicios s
      WHERE s.id = servicio_uuid
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;

-- INSERT servicios: jefe con empresa_id (conductor opcional / NULL)
CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(p_empresa_id uuid, p_conductor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      p_empresa_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.empresas e
        WHERE e.id = p_empresa_id
          AND e.owner_id = auth.uid()
      )
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
        OR EXISTS (
          SELECT 1 FROM public.empresas e
          WHERE e.id = p_empresa_id AND e.owner_id = auth.uid()
        )
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
          AND e.owner_id = auth.uid()
          AND (p_empresa_id IS NULL OR ce.empresa_id = p_empresa_id)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "srv_ins" ON public.servicios;

CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_insert_servicio(empresa_id, conductor_id));

-- UPDATE: asignar conductor después (pendiente → asignado)
DROP POLICY IF EXISTS "srv_upd" ON public.servicios;

CREATE POLICY "srv_upd" ON public.servicios
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(id))
  WITH CHECK (public.user_can_access_servicio(id));

-- <<< END supabase/migrations/20260521140000_servicios_rls_pendiente_asignacion.sql


-- >>> FILE: supabase/migrations/20260521150000_servicios_rls_sin_conductor_definitivo.sql

-- =============================================================================
-- Servicios SIN conductor (pendiente_asignacion) — RLS definitivo
--
-- Objetivo:
--   • Empresa (owner) crea servicio con conductor_id NULL
--   • Paradas, planificación, asignación posterior
--   • Sin romper: conductor asignado, tracking, documentos, panel conductor
--
-- Idempotente. Ejecutar en Supabase SQL Editor si 42501 en INSERT servicios.
-- Sustituye / complementa: 20260521140000_servicios_rls_pendiente_asignacion.sql
-- =============================================================================

-- 1) Esquema: conductor opcional
ALTER TABLE public.servicios
  ALTER COLUMN conductor_id DROP NOT NULL;

COMMENT ON COLUMN public.servicios.conductor_id IS
  'Conductor principal. NULL = pendiente de asignación (visible en empresa, no en app conductor).';

-- -----------------------------------------------------------------------------
-- 2) Helpers SECURITY DEFINER (auth.uid() dentro de la función)
-- -----------------------------------------------------------------------------

/** Propietario de la empresa (jefe de flota en el modelo actual). */
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

COMMENT ON FUNCTION public.user_can_access_empresa(uuid) IS
  'True si auth.uid() es owner_id de la empresa. Base para INSERT/SELECT servicios sin conductor.';

REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated;

/** Acceso a un servicio existente (SELECT/UPDATE/stops/evidencias). */
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

COMMENT ON FUNCTION public.user_can_access_servicio(uuid) IS
  'Conductor del servicio; o dueño empresa (conductor_id NULL permitido); o jefe del conductor asignado.';

REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;

/** INSERT en servicios — conductor_id opcional. */
CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(p_empresa_id uuid, p_conductor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- A) Jefe: servicio de su empresa (sin conductor o con conductor de su flota)
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
    -- B) Conductor autónomo (sin empresa o con su empresa)
    OR (
      p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND (
        p_empresa_id IS NULL
        OR public.user_can_access_empresa(p_empresa_id)
      )
    )
    -- C) Jefe asigna conductor de flota al crear (empresa_id puede venir en el row)
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

COMMENT ON FUNCTION public.user_can_insert_servicio(uuid, uuid) IS
  'INSERT servicios: empresa sin conductor (NULL), con conductor de flota, o conductor autónomo.';

REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) Limpiar TODAS las políticas legacy en servicios (evita 42501 por política antigua)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'servicios'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.servicios', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicios TO authenticated;
GRANT ALL ON public.servicios TO service_role;

-- -----------------------------------------------------------------------------
-- 4) Políticas servicios (único conjunto activo)
-- -----------------------------------------------------------------------------

CREATE POLICY "srv_sel" ON public.servicios
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(id));

CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_insert_servicio(empresa_id, conductor_id));

CREATE POLICY "srv_upd" ON public.servicios
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(id))
  WITH CHECK (public.user_can_access_servicio(id));

CREATE POLICY "srv_del" ON public.servicios
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(id));

-- -----------------------------------------------------------------------------
-- 5) servicio_asignaciones (si la tabla existe; idempotente con 20260521120000)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'servicio_asignaciones'
  ) THEN
    ALTER TABLE public.servicio_asignaciones ENABLE ROW LEVEL SECURITY;

    GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicio_asignaciones TO authenticated;
    GRANT ALL ON public.servicio_asignaciones TO service_role;

    EXECUTE 'DROP POLICY IF EXISTS "sa_sel" ON public.servicio_asignaciones';
    EXECUTE 'DROP POLICY IF EXISTS "sa_ins" ON public.servicio_asignaciones';
    EXECUTE 'DROP POLICY IF EXISTS "sa_upd" ON public.servicio_asignaciones';
    EXECUTE 'DROP POLICY IF EXISTS "sa_del" ON public.servicio_asignaciones';

    EXECUTE $p$
      CREATE POLICY "sa_sel" ON public.servicio_asignaciones
        FOR SELECT TO authenticated
        USING (public.user_can_access_servicio(servicio_id))
    $p$;
    EXECUTE $p$
      CREATE POLICY "sa_ins" ON public.servicio_asignaciones
        FOR INSERT TO authenticated
        WITH CHECK (public.user_can_access_servicio(servicio_id))
    $p$;
    EXECUTE $p$
      CREATE POLICY "sa_upd" ON public.servicio_asignaciones
        FOR UPDATE TO authenticated
        USING (public.user_can_access_servicio(servicio_id))
        WITH CHECK (public.user_can_access_servicio(servicio_id))
    $p$;
    EXECUTE $p$
      CREATE POLICY "sa_del" ON public.servicio_asignaciones
        FOR DELETE TO authenticated
        USING (public.user_can_access_servicio(servicio_id))
    $p$;
  END IF;
END;
$$;

-- <<< END supabase/migrations/20260521150000_servicios_rls_sin_conductor_definitivo.sql


-- >>> FILE: supabase/migrations/20260521160000_servicios_estado_pendiente_asignacion.sql

-- Permitir estado operacional pendiente_asignacion (servicio sin chófer en empresa).
-- Si existe CHECK antiguo solo con asignado|en_curso|completado, el INSERT devolvía 400.

DO $$
DECLARE
  r record;
BEGIN
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
    EXECUTE format('ALTER TABLE public.servicios DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END;
$$;

COMMENT ON COLUMN public.servicios.estado IS
  'asignado | en_curso | completado | anulado | pendiente_asignacion (sin conductor aún)';

-- <<< END supabase/migrations/20260521160000_servicios_estado_pendiente_asignacion.sql


-- >>> FILE: supabase/migrations/20260522120000_stops_rls_conductor_empresa.sql

-- Permite a conductores activos de la empresa crear/ver paradas en servicios de esa empresa
-- (servicio aún sin conductor_id o planificado por flota).
-- Idempotente. Ejecutar en Supabase SQL Editor si falla INSERT en stops con 403.

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
        OR (
          s.empresa_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.conductor_empresa ce
            WHERE ce.empresa_id = s.empresa_id
              AND ce.user_id = auth.uid()
              AND (ce.activo IS DISTINCT FROM false)
          )
        )
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

COMMENT ON FUNCTION public.user_can_access_servicio(uuid) IS
  'Conductor del servicio; dueño empresa; conductor activo de la empresa del servicio; o jefe del conductor asignado.';

REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;

-- <<< END supabase/migrations/20260522120000_stops_rls_conductor_empresa.sql


-- >>> FILE: supabase/migrations/20260522130000_servicios_estado_cerrado.sql

-- Cierre documental del viaje (firma + comentario), distinto de operativa en muelles.

DO $$
DECLARE
  r record;
BEGIN
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
    EXECUTE format('ALTER TABLE public.servicios DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.servicios
  ADD CONSTRAINT servicios_estado_check
  CHECK (
    estado IN (
      'pendiente_asignacion',
      'asignado',
      'en_curso',
      'completado',
      'cerrado',
      'anulado',
      'cancelado'
    )
  );

COMMENT ON COLUMN public.servicios.estado IS
  'pendiente_asignacion | asignado | en_curso | completado (operativa) | cerrado (expediente firmado) | anulado | cancelado';

-- <<< END supabase/migrations/20260522130000_servicios_estado_cerrado.sql


-- >>> FILE: supabase/migrations/20260523120000_repair_servicios_rls_functions.sql

-- =============================================================================
-- REPARACIÓN: funciones RLS de servicios (INSERT bloqueado / SQL manual roto)
--
-- Vuelve a definir user_can_access_empresa, user_can_access_servicio y
-- user_can_insert_servicio exactamente como en 20260521150000.
-- NO elimina políticas salvo srv_ins; sustituye funciones y recrea INSERT.
--
-- Ejecutar en Supabase SQL Editor si POST /servicios devuelve 403 o 42501.
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

COMMENT ON FUNCTION public.user_can_access_empresa(uuid) IS
  'True si auth.uid() es owner_id de la empresa.';

REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated;

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

COMMENT ON FUNCTION public.user_can_access_servicio(uuid) IS
  'Conductor del servicio; dueño empresa; o jefe del conductor asignado.';

REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;

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

COMMENT ON FUNCTION public.user_can_insert_servicio(uuid, uuid) IS
  'INSERT servicios: empresa sin conductor (NULL), con conductor de flota, o autónomo.';

REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated;

-- Política INSERT: re-crear por si quedó apuntando a otra función o corrupta
DROP POLICY IF EXISTS "srv_ins" ON public.servicios;
CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_insert_servicio(empresa_id, conductor_id));

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicios TO authenticated;

-- <<< END supabase/migrations/20260523120000_repair_servicios_rls_functions.sql


-- >>> FILE: supabase/migrations/20260525130000_fase1_cerrado_to_completado.sql

-- Fase 1: unificar cierre documental en estado `completado`.
-- La app sigue leyendo `cerrado` en registros no migrados; el CHECK conserva ambos valores.
-- Idempotente: solo filas con estado = 'cerrado'.

UPDATE public.servicios
SET
  estado = 'completado',
  updated_at = COALESCE(updated_at, now())
WHERE estado = 'cerrado';

-- <<< END supabase/migrations/20260525130000_fase1_cerrado_to_completado.sql


-- >>> FILE: supabase/migrations/20260526120000_incidencias_operativas.sql

-- =============================================================================
-- PR-1: Incidencias operativas (entidad propia, separada de cronología)
-- Tabla incidencias + adjuntos vía evidencias.incidencia_id + vista resumen empresa.
-- Idempotente. Aplicar en Supabase DEMO (no producción hasta UAT).
-- =============================================================================

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

-- updated_at
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

-- Coherencia stop_id ↔ servicio_id
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

-- -----------------------------------------------------------------------------
-- 2) evidencias.incidencia_id (fotos adjuntas; tipo=foto)
-- -----------------------------------------------------------------------------
ALTER TABLE public.evidencias
  ADD COLUMN IF NOT EXISTS incidencia_id uuid REFERENCES public.incidencias(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS evidencias_incidencia_id_idx
  ON public.evidencias (incidencia_id)
  WHERE incidencia_id IS NOT NULL;

COMMENT ON COLUMN public.evidencias.incidencia_id IS
  'Si NOT NULL: foto evidencia de una incidencia (no foto documental suelta).';

-- Coherencia: adjunto de incidencia debe ser foto y parada del mismo servicio
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

-- Ampliar políticas evidencias: acceso vía incidencia (por si stop cambia)
DROP POLICY IF EXISTS "ev_sel" ON public.evidencias;
DROP POLICY IF EXISTS "ev_ins" ON public.evidencias;
DROP POLICY IF EXISTS "ev_upd" ON public.evidencias;
DROP POLICY IF EXISTS "ev_del" ON public.evidencias;

CREATE POLICY "ev_sel" ON public.evidencias
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

CREATE POLICY "ev_ins" ON public.evidencias
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
            SELECT st2.servicio_id FROM public.stops st2 WHERE st2.id = evidencias.stop_id
          )
          AND public.user_can_access_servicio(inc.servicio_id)
      )
    )
  );

CREATE POLICY "ev_upd" ON public.evidencias
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

CREATE POLICY "ev_del" ON public.evidencias
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
-- 3) Vista resumen empresa (incluye estado actual del servicio)
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
  'Agregado por servicio con incidencias. servicio_estado_actual = servicios.estado en tiempo real.';

-- -----------------------------------------------------------------------------
-- 4) RLS incidencias
-- -----------------------------------------------------------------------------
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.incidencias TO authenticated;
GRANT ALL ON public.incidencias TO service_role;
GRANT SELECT ON public.v_servicio_incidencias_resumen TO authenticated;
GRANT ALL ON public.v_servicio_incidencias_resumen TO service_role;

DROP POLICY IF EXISTS "inc_sel" ON public.incidencias;
DROP POLICY IF EXISTS "inc_ins" ON public.incidencias;

CREATE POLICY "inc_sel" ON public.incidencias
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "inc_ins" ON public.incidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_servicio(servicio_id)
    AND empresa_id = (
      SELECT sv.empresa_id FROM public.servicios sv WHERE sv.id = servicio_id
    )
    AND (
      stop_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.stops st
        WHERE st.id = stop_id AND st.servicio_id = incidencias.servicio_id
      )
    )
  );

-- Sin UPDATE/DELETE para authenticated (auditoría; solo service_role)

-- <<< END supabase/migrations/20260526120000_incidencias_operativas.sql


-- >>> FILE: supabase/migrations/20260527120000_profiles_can_drive.sql

-- Capacidad explícita de operar como conductor (panel jornada/servicio).
-- Independiente de ser owner de empresa o tipo_cuenta = empresa.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_drive boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_drive IS
  'Si true: el usuario puede usar el panel conductor. Para tipo_cuenta=empresa activa el modo híbrido (conmutador Empresa↔Conductor).';

UPDATE public.profiles
SET can_drive = true
WHERE tipo_cuenta IN ('autonomo', 'conductor');

UPDATE public.profiles
SET can_drive = false
WHERE tipo_cuenta = 'empresa';

-- <<< END supabase/migrations/20260527120000_profiles_can_drive.sql


-- >>> FILE: supabase/migrations/20260528120000_product1_account_types.sql

-- PRODUCT-1: tipos de cuenta, empresa_status y migración legacy autonomo → autonomo_pro

-- ─── empresa_status (solo cuentas empresa) ───────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS empresa_status text;

COMMENT ON COLUMN public.profiles.empresa_status IS
  'Solo tipo_cuenta=empresa: pending | approved | rejected. Bloqueo shell empresa en producción si != approved.';

-- Cuentas empresa existentes → approved (no bloquear producción actual)
UPDATE public.profiles
SET empresa_status = 'approved'
WHERE tipo_cuenta = 'empresa'
  AND (empresa_status IS NULL OR empresa_status = '');

-- Legacy autonomo → autonomo_pro
UPDATE public.profiles
SET tipo_cuenta = 'autonomo_pro'
WHERE tipo_cuenta = 'autonomo';

-- can_drive: solo relevante para empresa; operadores no dependen del flag
UPDATE public.profiles
SET can_drive = false
WHERE tipo_cuenta IN ('conductor', 'autonomo_pro');

-- Empresa sin status explícito tras migración
UPDATE public.profiles
SET empresa_status = 'pending'
WHERE tipo_cuenta = 'empresa'
  AND empresa_status IS NULL;

-- Check opcional (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_empresa_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_empresa_status_check
      CHECK (
        empresa_status IS NULL
        OR empresa_status IN ('pending', 'approved', 'rejected')
      );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- <<< END supabase/migrations/20260528120000_product1_account_types.sql


-- >>> FILE: supabase/migrations/20260528140000_autonomo_pro_servicios_rls_repair.sql

-- =============================================================================
-- Autónomo PRO: reparación RLS INSERT en servicios (42501)
--
-- Síntoma: POST /servicios con empresa_id NULL y conductor_id = auth.uid()
-- devuelve 42501 aunque GRANT INSERT exista.
--
-- Causas típicas:
--   1) Políticas legacy duplicadas en `servicios`
--   2) Función user_can_insert_servicio desactualizada
--   3) Petición como rol `anon` (sin JWT) — policy es TO authenticated
--
-- Ejecutar en Supabase SQL Editor (proyecto Demo o el que use la app).
-- =============================================================================

-- ─── Funciones (misma lógica que 20260521150000 + repair) ───────────────────
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
    -- A) Jefe de flota
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
    -- B) Autónomo PRO / conductor propio: empresa_id NULL, conductor = yo
    OR (
      auth.uid() IS NOT NULL
      AND p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND (
        p_empresa_id IS NULL
        OR public.user_can_access_empresa(p_empresa_id)
      )
    )
    -- C) Jefe asigna conductor de su flota
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

COMMENT ON FUNCTION public.user_can_insert_servicio(uuid, uuid) IS
  'INSERT servicios: flota, autónomo PRO (empresa_id null + conductor_id=auth.uid), o asignación jefe.';

REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated;

-- ─── Eliminar TODAS las políticas legacy en servicios ───────────────────────
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'servicios'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.servicios', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

-- Endurecer: anon sin DML (si aún aparece en grants, esto lo corrige)
REVOKE ALL ON TABLE public.servicios FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.servicios TO authenticated;
GRANT ALL ON TABLE public.servicios TO service_role;

CREATE POLICY "srv_sel" ON public.servicios
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(id));

CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_insert_servicio(empresa_id, conductor_id));

CREATE POLICY "srv_upd" ON public.servicios
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(id))
  WITH CHECK (public.user_can_access_servicio(id));

CREATE POLICY "srv_del" ON public.servicios
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(id));

-- <<< END supabase/migrations/20260528140000_autonomo_pro_servicios_rls_repair.sql


-- >>> FILE: supabase/migrations/20260529120000_servicios_rls_autonomo_pro_ownership.sql

-- =============================================================================
-- RLS servicios — ownership Autónomo PRO + flota empresa (multi-tenant ready)
--
-- Autónomo PRO (servicio propio):
--   empresa_id IS NULL
--   conductor_id = auth.uid()
--   → INSERT / SELECT / UPDATE / DELETE del propio servicio
--
-- Flota empresa (sin abrir acceso global):
--   owner empresa, conductor asignado, vínculo conductor_empresa activo
--
-- NO usa USING (true). Todo vía funciones SECURITY DEFINER + auth.uid().
-- =============================================================================

-- ─── Ownership helpers (reutilizables; futuro RBAC / multi-tenant por empresa_id) ─

/** Servicio personal Autónomo PRO: sin tenant empresa, conductor = usuario actual. */
CREATE OR REPLACE FUNCTION public.servicio_is_autonomo_pro_owned(
  p_empresa_id uuid,
  p_conductor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_empresa_id IS NULL
    AND p_conductor_id IS NOT NULL
    AND p_conductor_id = auth.uid();
$$;

COMMENT ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) IS
  'True si el servicio es propiedad directa del conductor autónomo (empresa_id NULL, conductor_id = auth.uid()).';

/** Dueño de empresa (tenant) en el modelo actual (owner_id). */
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

COMMENT ON FUNCTION public.user_can_access_empresa(uuid) IS
  'True si auth.uid() es owner_id de la empresa (tenant).';

/** Conductor activo vinculado a una empresa (flota). */
CREATE OR REPLACE FUNCTION public.user_is_active_conductor_of_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_empresa_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      WHERE ce.empresa_id = p_empresa_id
        AND ce.user_id = auth.uid()
        AND (ce.activo IS DISTINCT FROM false)
    );
$$;

-- ─── SELECT / UPDATE / DELETE (fila existente por id) ───────────────────────

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
        public.servicio_is_autonomo_pro_owned(s.empresa_id, s.conductor_id)
        OR (s.conductor_id IS NOT NULL AND s.conductor_id = auth.uid())
        OR public.user_can_access_empresa(s.empresa_id)
        OR (
          s.empresa_id IS NOT NULL
          AND public.user_is_active_conductor_of_empresa(s.empresa_id)
        )
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

COMMENT ON FUNCTION public.user_can_access_servicio(uuid) IS
  'Acceso a servicio: autónomo PRO propio, conductor asignado, owner empresa, conductor de flota, o jefe del conductor.';

-- ─── INSERT (valores de la fila nueva) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(
  p_empresa_id uuid,
  p_conductor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- 1) Autónomo PRO: servicio propio sin empresa
    public.servicio_is_autonomo_pro_owned(p_empresa_id, p_conductor_id)
    -- 2) Owner empresa: planificar servicio de su tenant (conductor opcional)
    OR (
      public.user_can_access_empresa(p_empresa_id)
      AND (
        p_conductor_id IS NULL
        OR p_conductor_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          WHERE ce.empresa_id = p_empresa_id
            AND ce.user_id = p_conductor_id
            AND (ce.activo IS DISTINCT FROM false)
        )
      )
    )
    -- 3) Conductor de flota creando/asignándose en servicio de su empresa
    OR (
      auth.uid() IS NOT NULL
      AND p_empresa_id IS NOT NULL
      AND p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND public.user_is_active_conductor_of_empresa(p_empresa_id)
    )
    -- 4) Jefe asigna conductor de su flota al crear
    OR (
      p_conductor_id IS NOT NULL
      AND p_empresa_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.conductor_empresa ce
        INNER JOIN public.empresas e ON e.id = ce.empresa_id
        WHERE ce.user_id = p_conductor_id
          AND ce.empresa_id = p_empresa_id
          AND (ce.activo IS DISTINCT FROM false)
          AND e.owner_id IS NOT NULL
          AND e.owner_id = auth.uid()
      )
    );
$$;

COMMENT ON FUNCTION public.user_can_insert_servicio(uuid, uuid) IS
  'INSERT servicios: autónomo PRO (empresa_id null), flota empresa, o asignación por jefe.';

-- ─── Permisos de ejecución ───────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO service_role;

-- ─── Políticas únicas en servicios ───────────────────────────────────────────

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'servicios'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.servicios', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.servicios FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.servicios TO authenticated;
GRANT ALL ON TABLE public.servicios TO service_role;

CREATE POLICY "srv_sel" ON public.servicios
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(id));

CREATE POLICY "srv_ins" ON public.servicios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_insert_servicio(empresa_id, conductor_id));

CREATE POLICY "srv_upd" ON public.servicios
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(id))
  WITH CHECK (public.user_can_access_servicio(id));

CREATE POLICY "srv_del" ON public.servicios
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(id));

-- ─── Validación manual (SQL Editor, sustituir UUID) ───────────────────────────
-- SELECT public.servicio_is_autonomo_pro_owned(NULL, 'TU-UUID'::uuid);
-- Nota: auth.uid() solo existe en peticiones JWT; en Editor como postgres será NULL.

-- <<< END supabase/migrations/20260529120000_servicios_rls_autonomo_pro_ownership.sql


-- >>> FILE: supabase/migrations/20260529180000_fix_user_can_insert_servicio_autonomo_pro.sql

-- =============================================================================
-- FIX: user_can_insert_servicio — rama Autónomo PRO explícita (tipo_cuenta + NULL empresa)
--
-- Ejecutar si srv_ins ya usa user_can_insert_servicio pero INSERT sigue en 42501.
-- No toca políticas (srv_sel/srv_ins/srv_upd/srv_del).
--
-- Autónomo PRO permitido cuando:
--   auth.uid() IS NOT NULL
--   empresa_id IS NULL
--   conductor_id = auth.uid()
--   profiles.tipo_cuenta IN ('autonomo_pro', 'autonomo')  -- legacy autonomo migrado
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_profile_is_autonomo_pro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND COALESCE(pr.tipo_cuenta, '') IN ('autonomo_pro', 'autonomo')
  );
$$;

COMMENT ON FUNCTION public.user_profile_is_autonomo_pro() IS
  'Perfil autónomo PRO (o legacy autonomo). Excluye conductor puro y empresa.';

CREATE OR REPLACE FUNCTION public.servicio_is_autonomo_pro_owned(
  p_empresa_id uuid,
  p_conductor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.user_profile_is_autonomo_pro()
    AND p_empresa_id IS NULL
    AND p_conductor_id IS NOT NULL
    AND p_conductor_id = auth.uid();
$$;

COMMENT ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) IS
  'Ownership Autónomo PRO: sin empresa_id, conductor_id = auth.uid(), tipo_cuenta autónomo.';

-- ─── Función objetivo del diagnóstico ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(
  p_empresa_id uuid,
  p_conductor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ---------------------------------------------------------------------------
    -- (1) AUTÓNOMO PRO — NO exige empresa_id; NO es tipo_cuenta empresa
    ---------------------------------------------------------------------------
    (
      auth.uid() IS NOT NULL
      AND p_empresa_id IS NULL
      AND p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND public.user_profile_is_autonomo_pro()
    )
    ---------------------------------------------------------------------------
    -- (2) Owner empresa (tenant): empresa_id obligatorio
    ---------------------------------------------------------------------------
    OR (
      p_empresa_id IS NOT NULL
      AND public.user_can_access_empresa(p_empresa_id)
      AND (
        p_conductor_id IS NULL
        OR p_conductor_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.conductor_empresa ce
          WHERE ce.empresa_id = p_empresa_id
            AND ce.user_id = p_conductor_id
            AND (ce.activo IS DISTINCT FROM false)
        )
      )
    )
    ---------------------------------------------------------------------------
    -- (3) Conductor de flota en servicio de su empresa
    ---------------------------------------------------------------------------
    OR (
      auth.uid() IS NOT NULL
      AND p_empresa_id IS NOT NULL
      AND p_conductor_id IS NOT NULL
      AND p_conductor_id = auth.uid()
      AND public.user_is_active_conductor_of_empresa(p_empresa_id)
    )
    ---------------------------------------------------------------------------
    -- (4) Jefe asigna conductor de flota al crear
    ---------------------------------------------------------------------------
    OR (
      p_empresa_id IS NOT NULL
      AND p_conductor_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.conductor_empresa ce
        INNER JOIN public.empresas e ON e.id = ce.empresa_id
        WHERE ce.user_id = p_conductor_id
          AND ce.empresa_id = p_empresa_id
          AND (ce.activo IS DISTINCT FROM false)
          AND e.owner_id IS NOT NULL
          AND e.owner_id = auth.uid()
      )
    );
$$;

COMMENT ON FUNCTION public.user_can_insert_servicio(uuid, uuid) IS
  'INSERT: (1) autonomo_pro sin empresa_id; (2-4) flota empresa. Sin USING(true).';

-- SELECT/UPDATE alineados con ownership autónomo + perfil
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
        public.servicio_is_autonomo_pro_owned(s.empresa_id, s.conductor_id)
        OR (
          s.conductor_id IS NOT NULL
          AND s.conductor_id = auth.uid()
        )
        OR public.user_can_access_empresa(s.empresa_id)
        OR (
          s.empresa_id IS NOT NULL
          AND public.user_is_active_conductor_of_empresa(s.empresa_id)
        )
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

REVOKE ALL ON FUNCTION public.user_profile_is_autonomo_pro() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_profile_is_autonomo_pro() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.servicio_is_autonomo_pro_owned(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated, service_role;

-- Ver definición activa tras aplicar:
-- SELECT pg_get_functiondef('public.user_can_insert_servicio(uuid,uuid)'::regprocedure);

-- <<< END supabase/migrations/20260529180000_fix_user_can_insert_servicio_autonomo_pro.sql


-- >>> FILE: supabase/migrations/20260529200000_user_can_insert_servicio_definitive.sql

-- =============================================================================
-- DEFINITIVO: user_can_insert_servicio + helpers (Autónomo PRO, sin policies)
--
-- Ejecutar en Supabase SQL Editor si srv_ins OK pero INSERT sigue 42501.
-- Incluye TODAS las dependencias en un solo script.
--
-- Rama (1) Autónomo PRO — condiciones explícitas:
--   auth.uid() IS NOT NULL
--   p_empresa_id IS NULL          (sin tenant empresa)
--   p_conductor_id = auth.uid()   (ownership fila)
--   profiles.tipo_cuenta IN ('autonomo_pro','autonomo')  — NO empresa/conductor
--
-- NO usa USING(true). NO exige empresa_id NOT NULL para autónomo.
-- =============================================================================

-- ─── Helper: dueño de empresa (tenant) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_can_access_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_empresa_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.empresas e
      WHERE e.id = p_empresa_id
        AND e.owner_id IS NOT NULL
        AND e.owner_id = auth.uid()
    );
$$;

-- ─── Helper: conductor activo en flota ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_is_active_conductor_of_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_empresa_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.conductor_empresa ce
      WHERE ce.empresa_id = p_empresa_id
        AND ce.user_id = auth.uid()
        AND (ce.activo IS DISTINCT FROM false)
    );
$$;

-- ─── Helper: perfil Autónomo PRO (tipo explícito, no legacy empresa-only) ───
CREATE OR REPLACE FUNCTION public.user_profile_is_autonomo_pro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT pr.tipo_cuenta IN ('autonomo_pro', 'autonomo')
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.user_profile_is_autonomo_pro() IS
  'True si profiles.tipo_cuenta es autonomo_pro o autonomo (legacy). False si conductor/empresa/sin fila.';

-- ─── FUNCIÓN PRINCIPAL: INSERT ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_can_insert_servicio(
  p_empresa_id uuid,
  p_conductor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_is_autonomo boolean;
BEGIN
  v_uid := auth.uid();
  v_is_autonomo := public.user_profile_is_autonomo_pro();

  -- (1) AUTÓNOMO PRO: servicio propio, sin empresa_id
  IF v_uid IS NOT NULL
     AND p_empresa_id IS NULL
     AND p_conductor_id IS NOT NULL
     AND p_conductor_id = v_uid
     AND v_is_autonomo
  THEN
    RETURN true;
  END IF;

  -- (2) Owner empresa: servicio del tenant (conductor opcional)
  IF p_empresa_id IS NOT NULL
     AND public.user_can_access_empresa(p_empresa_id)
     AND (
       p_conductor_id IS NULL
       OR p_conductor_id = v_uid
       OR EXISTS (
         SELECT 1
         FROM public.conductor_empresa ce
         WHERE ce.empresa_id = p_empresa_id
           AND ce.user_id = p_conductor_id
           AND (ce.activo IS DISTINCT FROM false)
       )
     )
  THEN
    RETURN true;
  END IF;

  -- (3) Conductor de flota: servicio de su empresa, asignado a sí mismo
  IF v_uid IS NOT NULL
     AND p_empresa_id IS NOT NULL
     AND p_conductor_id IS NOT NULL
     AND p_conductor_id = v_uid
     AND public.user_is_active_conductor_of_empresa(p_empresa_id)
  THEN
    RETURN true;
  END IF;

  -- (4) Jefe asigna conductor de flota al crear
  IF p_empresa_id IS NOT NULL
     AND p_conductor_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.conductor_empresa ce
       INNER JOIN public.empresas e ON e.id = ce.empresa_id
       WHERE ce.user_id = p_conductor_id
         AND ce.empresa_id = p_empresa_id
         AND (ce.activo IS DISTINCT FROM false)
         AND e.owner_id IS NOT NULL
         AND e.owner_id = v_uid
     )
  THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.user_can_insert_servicio(uuid, uuid) IS
  'INSERT servicios. Rama 1: autonomo_pro + empresa_id NULL + conductor_id=auth.uid(). Ramas 2-4: flota.';

-- ─── SELECT / UPDATE (acceso a fila existente) ───────────────────────────────
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
        (
          auth.uid() IS NOT NULL
          AND s.empresa_id IS NULL
          AND s.conductor_id IS NOT NULL
          AND s.conductor_id = auth.uid()
          AND public.user_profile_is_autonomo_pro()
        )
        OR (s.conductor_id IS NOT NULL AND s.conductor_id = auth.uid())
        OR public.user_can_access_empresa(s.empresa_id)
        OR (
          s.empresa_id IS NOT NULL
          AND public.user_is_active_conductor_of_empresa(s.empresa_id)
        )
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

-- ─── Permisos ────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_profile_is_autonomo_pro() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_insert_servicio(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_active_conductor_of_empresa(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_profile_is_autonomo_pro() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_insert_servicio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated, service_role;

-- <<< END supabase/migrations/20260529200000_user_can_insert_servicio_definitive.sql


-- >>> FILE: supabase/migrations/20260530150000_incidencias_autonomo_pro.sql

-- =============================================================================
-- Incidencias operativas — soporte Autónomo PRO (servicios.empresa_id NULL)
--
-- Síntoma: RAISE 'incidencias: servicio sin empresa_id' al crear incidencia
-- en servicio propio (conductor_id = auth.uid(), empresa_id null).
--
-- Ejecutar en Supabase SQL Editor (Demo / Prod).
-- =============================================================================

-- empresa_id opcional en incidencias (flota vs autónomo)
ALTER TABLE public.incidencias
  ALTER COLUMN empresa_id DROP NOT NULL;

COMMENT ON COLUMN public.incidencias.empresa_id IS
  'Tenant empresa (flota). NULL si el servicio es Autónomo PRO (solo conductor_id).';

-- Trigger: validar ownership servicio ↔ incidencia (flota y autónomo)
CREATE OR REPLACE FUNCTION public.incidencias_validate_servicio_stop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_conductor uuid;
BEGIN
  SELECT s.empresa_id, s.conductor_id
  INTO v_empresa, v_conductor
  FROM public.servicios s
  WHERE s.id = NEW.servicio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'incidencias: servicio no encontrado';
  END IF;

  -- Autónomo PRO: servicio sin empresa, conductor dueño del servicio
  IF v_empresa IS NULL THEN
    IF v_conductor IS NULL OR v_conductor IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'incidencias: servicio autónomo sin ownership válido para el usuario actual';
    END IF;
    IF NEW.empresa_id IS NOT NULL THEN
      RAISE EXCEPTION 'incidencias: empresa_id debe ser null para servicio autónomo';
    END IF;
    NEW.empresa_id := NULL;
    IF NEW.conductor_id IS NULL THEN
      NEW.conductor_id := auth.uid();
    ELSIF NEW.conductor_id IS DISTINCT FROM v_conductor
      AND NEW.conductor_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'incidencias: conductor_id no coincide con el servicio';
    END IF;
  ELSE
  -- Flota empresa
    IF NEW.empresa_id IS DISTINCT FROM v_empresa THEN
      RAISE EXCEPTION 'incidencias: empresa_id no coincide con el servicio';
    END IF;
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

-- RLS INSERT: empresa_id nullable (IS NOT DISTINCT FROM servicio.empresa_id)
DROP POLICY IF EXISTS "inc_ins" ON public.incidencias;

CREATE POLICY "inc_ins" ON public.incidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_servicio(servicio_id)
    AND empresa_id IS NOT DISTINCT FROM (
      SELECT sv.empresa_id FROM public.servicios sv WHERE sv.id = servicio_id
    )
    AND (
      stop_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.stops st
        WHERE st.id = stop_id AND st.servicio_id = incidencias.servicio_id
      )
    )
  );

-- <<< END supabase/migrations/20260530150000_incidencias_autonomo_pro.sql


-- >>> FILE: supabase/migrations/20260530160000_autonomo_pro_servicio_tenant_enforce.sql

-- Autónomo PRO: al crear servicio propio (conductor_id = auth.uid), forzar empresa_id NULL.
-- Evita herencia accidental desde cliente o defaults aunque exista conductor_empresa activo.

CREATE OR REPLACE FUNCTION public.servicios_enforce_autonomo_pro_own_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND public.user_profile_is_autonomo_pro()
     AND NEW.conductor_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NEW.conductor_id = auth.uid()
  THEN
    NEW.empresa_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.servicios_enforce_autonomo_pro_own_tenant() IS
  'BEFORE INSERT: autonomo_pro creando servicio propio → empresa_id siempre NULL (sin tenant flota).';

DROP TRIGGER IF EXISTS servicios_bi_autonomo_pro_own_tenant ON public.servicios;

CREATE TRIGGER servicios_bi_autonomo_pro_own_tenant
  BEFORE INSERT ON public.servicios
  FOR EACH ROW
  EXECUTE FUNCTION public.servicios_enforce_autonomo_pro_own_tenant();

REVOKE ALL ON FUNCTION public.servicios_enforce_autonomo_pro_own_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.servicios_enforce_autonomo_pro_own_tenant() TO authenticated, service_role;

-- <<< END supabase/migrations/20260530160000_autonomo_pro_servicio_tenant_enforce.sql


-- >>> FILE: supabase/migrations/20260530170000_multi_conductor_v1_asignaciones_select.sql

-- =============================================================================
-- Multi-Conductor V1 — visibilidad por servicio_asignaciones
--
-- Objetivo:
--   Un servicio puede tener varios conductores (1 principal en servicios.conductor_id
--   + N colaboradores en servicio_asignaciones). Esta función añade una cláusula:
--   cualquier conductor con fila en servicio_asignaciones para ese servicio también
--   puede acceder (SELECT) al servicio (y por tanto a sus stops, evidencias, etc.).
--
-- ROBUSTEZ: se reconstruye con subconsultas inline (solo dependen de las tablas
--   servicios / conductor_empresa / empresas + user_can_access_empresa), sin
--   depender de funciones auxiliares que pudieran no existir en DEMO.
--   Cláusulas conservadas:
--     • conductor principal (servicios.conductor_id = auth.uid())  -> cubre también autónomo propio
--     • dueño de la empresa
--     • conductor activo de la empresa del servicio
--     • jefe del conductor asignado
--   Cláusula nueva:
--     • conductor con fila en servicio_asignaciones (multi-conductor V1)
--
-- No cambia: estado, FIFO, lógica operacional, expediente. Solo amplía visibilidad.
-- Idempotente (CREATE OR REPLACE). Ejecutar en el SQL Editor de DEMO.
-- =============================================================================

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
        OR (
          s.empresa_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.conductor_empresa ce
            WHERE ce.empresa_id = s.empresa_id
              AND ce.user_id = auth.uid()
              AND (ce.activo IS DISTINCT FROM false)
          )
        )
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
        -- Multi-Conductor V1: conductor colaborador asignado vía servicio_asignaciones
        OR EXISTS (
          SELECT 1
          FROM public.servicio_asignaciones sa
          WHERE sa.servicio_id = s.id
            AND sa.conductor_id = auth.uid()
        )
      FROM public.servicios s
      WHERE s.id = servicio_uuid
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.user_can_access_servicio(uuid) IS
  'Conductor principal; dueño empresa; conductor activo de la empresa; jefe del conductor asignado; o conductor con fila en servicio_asignaciones (multi-conductor V1).';

REVOKE ALL ON FUNCTION public.user_can_access_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_servicio(uuid) TO authenticated, service_role;

-- <<< END supabase/migrations/20260530170000_multi_conductor_v1_asignaciones_select.sql


-- >>> FILE: supabase/migrations/20260530180000_multi_conductor_stops_rls_repair.sql

-- =============================================================================
-- Multi-Conductor V1 — reparación RLS de stops
--
-- Problema detectado en DEMO: la política legacy "stops_acceso" (FOR ALL) comprueba
--   directamente s.conductor_id = auth.uid() OR es_jefe_de(s.conductor_id),
--   por lo que un conductor COLABORADOR (asignado vía servicio_asignaciones, pero
--   que no es el principal) no puede leer/operar las paradas del servicio.
--   Consecuencia: el servicio compartido se cae del "slot activo" del colaborador.
--
-- Arreglo: alinear stops con el resto de tablas usando user_can_access_servicio,
--   que ya contempla al colaborador (multi-conductor V1).
--
-- Idempotente. Elimina TODAS las políticas actuales de stops y crea el conjunto
--   estándar (sel/ins/upd/del). Ejecutar en el SQL Editor de DEMO.
-- =============================================================================

ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stops TO authenticated;
GRANT ALL ON public.stops TO service_role;

-- Eliminar cualquier política previa (incluida la legacy "stops_acceso")
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stops'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.stops', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "stp_sel" ON public.stops
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

CREATE POLICY "stp_ins" ON public.stops
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "stp_upd" ON public.stops
  FOR UPDATE TO authenticated
  USING (public.user_can_access_servicio(servicio_id))
  WITH CHECK (public.user_can_access_servicio(servicio_id));

CREATE POLICY "stp_del" ON public.stops
  FOR DELETE TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

-- <<< END supabase/migrations/20260530180000_multi_conductor_stops_rls_repair.sql


-- >>> FILE: supabase/migrations/20260530190000_multi_conductor_evidencias_rls_repair.sql

-- =============================================================================
-- Multi-Conductor V1 — reparación RLS de evidencias
--
-- Problema en DEMO: la política legacy "evidencias_acceso" (FOR ALL) comprueba
--   s.conductor_id = auth.uid() OR es_jefe_de(s.conductor_id) (vía stops→servicios),
--   por lo que un conductor COLABORADOR no puede ver ni subir fotos/CMR/documentos
--   del servicio compartido.
--
-- Arreglo: alinear evidencias con la versión canónica del repo
--   (user_can_access_servicio, con rama de incidencias), que ya contempla al
--   colaborador (multi-conductor V1).
--
-- Idempotente. Elimina TODAS las políticas actuales de evidencias y crea el
--   conjunto estándar (sel/ins/upd/del). Ejecutar en el SQL Editor de DEMO.
-- =============================================================================

ALTER TABLE public.evidencias ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidencias TO authenticated;
GRANT ALL ON public.evidencias TO service_role;

-- Eliminar cualquier política previa (incluida la legacy "evidencias_acceso")
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'evidencias'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.evidencias', pol.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "ev_sel" ON public.evidencias
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

CREATE POLICY "ev_ins" ON public.evidencias
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
            SELECT st2.servicio_id FROM public.stops st2 WHERE st2.id = evidencias.stop_id
          )
          AND public.user_can_access_servicio(inc.servicio_id)
      )
    )
  );

CREATE POLICY "ev_upd" ON public.evidencias
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

CREATE POLICY "ev_del" ON public.evidencias
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

-- <<< END supabase/migrations/20260530190000_multi_conductor_evidencias_rls_repair.sql


-- >>> FILE: supabase/migrations/20260530200000_multi_conductor_fase2a_participacion.sql

-- Multi-Conductor FASE 2A: estado de participación individual por conductor.
-- Permite que cada conductor finalice SU participación sin cerrar el servicio global.
-- NO modifica servicios.estado, ni la cola FIFO, ni el expediente, ni cálculo de horas.

ALTER TABLE public.servicio_asignaciones
  ADD COLUMN IF NOT EXISTS estado_participacion text NOT NULL DEFAULT 'pendiente';

ALTER TABLE public.servicio_asignaciones
  ADD COLUMN IF NOT EXISTS fecha_inicio_participacion timestamptz;

ALTER TABLE public.servicio_asignaciones
  ADD COLUMN IF NOT EXISTS fecha_fin_participacion timestamptz;

-- Valores permitidos: pendiente | activo | finalizado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'servicio_asignaciones_estado_participacion_chk'
  ) THEN
    ALTER TABLE public.servicio_asignaciones
      ADD CONSTRAINT servicio_asignaciones_estado_participacion_chk
      CHECK (estado_participacion IN ('pendiente', 'activo', 'finalizado'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_servicio_asignaciones_participacion
  ON public.servicio_asignaciones (conductor_id, estado_participacion);

COMMENT ON COLUMN public.servicio_asignaciones.estado_participacion IS
  'Multi-conductor FASE 2A: pendiente | activo | finalizado. Estado individual del conductor, independiente de servicios.estado. finalizado libera al conductor sin cerrar el servicio.';
COMMENT ON COLUMN public.servicio_asignaciones.fecha_inicio_participacion IS
  'Multi-conductor FASE 2A: inicio de la participación del conductor (reservado para cálculo de horas en FASE 2B).';
COMMENT ON COLUMN public.servicio_asignaciones.fecha_fin_participacion IS
  'Multi-conductor FASE 2A: fin de la participación del conductor (al finalizar su parte sin cerrar el servicio).';

-- <<< END supabase/migrations/20260530200000_multi_conductor_fase2a_participacion.sql


-- >>> FILE: supabase/migrations/20260531150000_servicio_documentos_empresa.sql

-- Documentos subidos por la empresa al servicio (independientes de servicio_documentos_extra).
-- Idempotente: no borra tablas ni datos existentes.
-- Prerrequisitos en el mismo proyecto Supabase:
--   public.servicios, public.empresas
--   public.user_can_access_servicio(uuid)
--   public.user_can_access_empresa(uuid)
--   (recomendado: 20260514120000_rls_servicio_ownership_core.sql y
--    20260530170000_multi_conductor_v1_asignaciones_select.sql ya aplicadas)

CREATE TABLE IF NOT EXISTS public.servicio_documentos_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  subido_por uuid NOT NULL,
  subido_por_nombre text,
  archivo_url text NOT NULL,
  archivo_nombre text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_empresa_servicio
  ON public.servicio_documentos_empresa (servicio_id);

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_empresa_empresa
  ON public.servicio_documentos_empresa (empresa_id);

CREATE INDEX IF NOT EXISTS idx_servicio_documentos_empresa_servicio_created
  ON public.servicio_documentos_empresa (servicio_id, created_at DESC);

ALTER TABLE public.servicio_documentos_empresa ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.servicio_documentos_empresa TO authenticated;
GRANT ALL ON public.servicio_documentos_empresa TO service_role;

DROP POLICY IF EXISTS "sdemp_sel" ON public.servicio_documentos_empresa;
DROP POLICY IF EXISTS "sdemp_ins" ON public.servicio_documentos_empresa;
DROP POLICY IF EXISTS "sdemp_del" ON public.servicio_documentos_empresa;

-- Conductor y empresa: leer si tienen acceso al servicio.
CREATE POLICY "sdemp_sel" ON public.servicio_documentos_empresa
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

-- Solo personal de empresa (owner / membresía vía user_can_access_empresa).
CREATE POLICY "sdemp_ins" ON public.servicio_documentos_empresa
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_empresa(empresa_id)
    AND EXISTS (
      SELECT 1 FROM public.servicios s
      WHERE s.id = servicio_id
        AND s.empresa_id = empresa_id
    )
    AND subido_por = auth.uid()
  );

CREATE POLICY "sdemp_del" ON public.servicio_documentos_empresa
  FOR DELETE TO authenticated
  USING (public.user_can_access_empresa(empresa_id));

COMMENT ON TABLE public.servicio_documentos_empresa IS
  'Documentos subidos por la empresa al servicio. Almacenamiento en bucket operativo (ruta documentos_empresa/{empresa_id}/{servicio_id}/).';

-- <<< END supabase/migrations/20260531150000_servicio_documentos_empresa.sql


-- >>> FILE: scripts/prod-mail-cliente-columns.sql

-- PRODUCCIÓN: columnas mail cliente en documentacion_envios
-- Equivalente idempotente a 20260531160000 + 20260531170000 (versiones demo del repo).

ALTER TABLE public.documentacion_envios
  ADD COLUMN IF NOT EXISTS cc text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS destinatario text,
  ADD COLUMN IF NOT EXISTS remitente_mostrado text,
  ADD COLUMN IF NOT EXISTS reply_to text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

COMMENT ON COLUMN public.documentacion_envios.cc IS 'Copia (CC) del envío al cliente';
COMMENT ON COLUMN public.documentacion_envios.sent_at IS 'Marca de tiempo del envío efectivo';
COMMENT ON COLUMN public.documentacion_envios.destinatario IS 'Email principal (Para)';
COMMENT ON COLUMN public.documentacion_envios.remitente_mostrado IS 'From mostrado al cliente';
COMMENT ON COLUMN public.documentacion_envios.reply_to IS 'Reply-To (email ficha empresa)';
COMMENT ON COLUMN public.documentacion_envios.provider IS 'resend | simulacion';
COMMENT ON COLUMN public.documentacion_envios.provider_message_id IS 'ID mensaje Resend (si aplica)';

-- <<< END scripts/prod-mail-cliente-columns.sql


-- >>> FILE: supabase/migrations/20260531210000_conductor_empresa_telefono_movil.sql

-- Teléfono móvil principal del conductor (gestión flota / torre de control).
ALTER TABLE public.conductor_empresa
  ADD COLUMN IF NOT EXISTS telefono_movil text;

COMMENT ON COLUMN public.conductor_empresa.telefono_movil IS
  'Teléfono móvil principal del conductor para contacto operativo (jefe de tráfico).';

-- <<< END supabase/migrations/20260531210000_conductor_empresa_telefono_movil.sql


-- >>> FILE: supabase/migrations/20260615120000_empresas_conductor_codigo_lookup_prod.sql

-- Producción: lookup empresa por código para join conductor (mismo contrato que DEMO).
-- Aplicar en Supabase REAL (glyexutcypmhkndvmcxd).

DROP FUNCTION IF EXISTS public.lookup_empresa_por_codigo(text);

CREATE OR REPLACE FUNCTION public.lookup_empresa_por_codigo(p_codigo text)
RETURNS TABLE (
  id uuid,
  nombre text,
  codigo_equipo text,
  codigo_corto text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.nombre,
    e.codigo_equipo,
    e.codigo_corto
  FROM public.empresas e
  WHERE auth.uid() IS NOT NULL
    AND (
      upper(trim(coalesce(e.codigo_equipo, ''))) = upper(trim(coalesce(p_codigo, '')))
      OR upper(trim(coalesce(e.codigo_corto, ''))) = upper(trim(coalesce(p_codigo, '')))
    )
  LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.lookup_empresa_por_codigo(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lookup_empresa_por_codigo(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_empresa_por_codigo(text) TO authenticated;

COMMENT ON FUNCTION public.lookup_empresa_por_codigo(text) IS
  'Join conductor: busca empresa por codigo_equipo o codigo_corto (authenticated).';

-- <<< END supabase/migrations/20260615120000_empresas_conductor_codigo_lookup_prod.sql


-- >>> FILE: supabase/migrations/20260617120000_empresa_usuarios_oficina_prod.sql

-- =============================================================================
-- PRODUCCIÓN: multiusuario oficina (empresa_usuarios + responsable en servicios)
-- Proyecto REAL glyexutcypmhkndvmcxd — idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.empresa_usuarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre          text,
  email           text,
  rol             text NOT NULL DEFAULT 'trafico'
    CHECK (rol IN ('jefe_flota', 'trafico', 'administrativo')),
  puede_ver_todos boolean NOT NULL DEFAULT false,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_empresa_activo
  ON public.empresa_usuarios (empresa_id) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_user_activo
  ON public.empresa_usuarios (user_id) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_empresa_id
  ON public.empresa_usuarios (empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_user_id
  ON public.empresa_usuarios (user_id);
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_rol
  ON public.empresa_usuarios (rol);

ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS responsable_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS responsable_nombre text;

CREATE INDEX IF NOT EXISTS idx_servicios_responsable_user
  ON public.servicios (responsable_user_id)
  WHERE responsable_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_servicios_empresa_responsable
  ON public.servicios (empresa_id, responsable_user_id);

COMMENT ON COLUMN public.servicios.responsable_nombre IS
  'Nombre del responsable de oficina al crear/asignar servicio.';

CREATE OR REPLACE FUNCTION public.get_current_office_user_context()
RETURNS TABLE (
  user_id uuid,
  email text,
  nombre text,
  empresa_id uuid,
  empresa_nombre text,
  rol text,
  puede_ver_todos boolean,
  activo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    eu.user_id,
    eu.email,
    eu.nombre,
    eu.empresa_id,
    e.nombre AS empresa_nombre,
    eu.rol,
    eu.puede_ver_todos,
    eu.activo
  FROM public.empresa_usuarios eu
  INNER JOIN public.empresas e ON e.id = eu.empresa_id
  WHERE eu.user_id = auth.uid()
    AND eu.activo = true
  ORDER BY eu.created_at
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_current_office_user_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_office_user_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.user_can_manage_empresa_usuarios(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1 FROM public.empresas e
    WHERE e.id = p_empresa_id AND e.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.rol = 'jefe_flota'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_empresa_usuarios(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_empresa_usuarios(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_is_active_office_peer(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.empresa_id = p_empresa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_is_active_office_peer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_active_office_peer(uuid) TO authenticated;

-- Seed jefe_flota para owners existentes
INSERT INTO public.empresa_usuarios (
  empresa_id, user_id, nombre, email, rol, puede_ver_todos, activo
)
SELECT
  e.id, e.owner_id, p.nombre, NULLIF(BTRIM(u.email), ''),
  'jefe_flota', true, true
FROM public.empresas e
INNER JOIN public.profiles p ON p.id = e.owner_id
LEFT JOIN auth.users u ON u.id = e.owner_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = e.id AND eu.user_id = e.owner_id
);

ALTER TABLE public.empresa_usuarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.empresa_usuarios TO authenticated;
GRANT ALL ON public.empresa_usuarios TO service_role;

DROP POLICY IF EXISTS eu_sel ON public.empresa_usuarios;
DROP POLICY IF EXISTS eu_ins ON public.empresa_usuarios;
DROP POLICY IF EXISTS eu_upd ON public.empresa_usuarios;
DROP POLICY IF EXISTS eu_sel_peer ON public.empresa_usuarios;
DROP POLICY IF EXISTS eu_sel_peer_demo ON public.empresa_usuarios;

CREATE POLICY eu_sel ON public.empresa_usuarios
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_can_manage_empresa_usuarios(empresa_id));

CREATE POLICY eu_ins ON public.empresa_usuarios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_empresa_usuarios(empresa_id));

CREATE POLICY eu_upd ON public.empresa_usuarios
  FOR UPDATE TO authenticated
  USING (public.user_can_manage_empresa_usuarios(empresa_id))
  WITH CHECK (public.user_can_manage_empresa_usuarios(empresa_id));

CREATE POLICY eu_sel_peer ON public.empresa_usuarios
  FOR SELECT TO authenticated
  USING (public.user_is_active_office_peer(empresa_id));

DROP POLICY IF EXISTS emp_sel_oficina ON public.empresas;
DROP POLICY IF EXISTS emp_sel_oficina_demo ON public.empresas;

CREATE POLICY emp_sel_oficina ON public.empresas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.empresa_usuarios eu
      WHERE eu.empresa_id = empresas.id
        AND eu.user_id = auth.uid()
        AND eu.activo = true
    )
  );

CREATE OR REPLACE FUNCTION public.user_can_access_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.empresas e
    WHERE e.id = p_empresa_id
      AND e.owner_id IS NOT NULL
      AND e.owner_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = auth.uid()
      AND eu.activo = true
  );
END;
$$;

COMMENT ON FUNCTION public.user_can_access_empresa(uuid) IS
  'Owner de empresa o usuario oficina activo (empresa_usuarios).';

REVOKE ALL ON FUNCTION public.user_can_access_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_empresa(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS ce_sel_oficina ON public.conductor_empresa;
DROP POLICY IF EXISTS ce_sel_oficina_demo ON public.conductor_empresa;

CREATE POLICY ce_sel_oficina ON public.conductor_empresa
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.empresa_usuarios eu
      WHERE eu.empresa_id = conductor_empresa.empresa_id
        AND eu.user_id = auth.uid()
        AND eu.activo = true
    )
  );

-- <<< END supabase/migrations/20260617120000_empresa_usuarios_oficina_prod.sql


-- >>> FILE: supabase/migrations/20260701120000_agenda_comercial.sql

-- Agenda comercial privada por tenant (empresa usuaria del SaaS).
-- Prospectos NO vinculados a servicios, conductores ni facturación.

CREATE TABLE IF NOT EXISTS public.agenda_comercial_prospectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  cif text,
  direccion text,
  localidad text,
  provincia text,
  telefono text,
  email text,
  web text,
  sector text,
  estado_comercial text NOT NULL DEFAULT 'pendiente_contactar',
  num_camiones integer,
  tipos_vehiculos text[] NOT NULL DEFAULT '{}',
  tipos_rutas text[] NOT NULL DEFAULT '{}',
  sistemas_actuales text[] NOT NULL DEFAULT '{}',
  dolores text[] NOT NULL DEFAULT '{}',
  ultima_nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agenda_comercial_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id uuid NOT NULL REFERENCES public.agenda_comercial_prospectos (id) ON DELETE CASCADE,
  tenant_empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  cargo text,
  telefono text,
  email text,
  whatsapp text,
  observaciones text,
  es_principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agenda_comercial_acciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id uuid NOT NULL REFERENCES public.agenda_comercial_prospectos (id) ON DELETE CASCADE,
  tenant_empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  fecha_hora timestamptz NOT NULL,
  contacto_nombre text,
  resultado text,
  proxima_accion text,
  notas text,
  completada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_prospectos_tenant
  ON public.agenda_comercial_prospectos (tenant_empresa_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agenda_contactos_prospecto
  ON public.agenda_comercial_contactos (prospecto_id);

CREATE INDEX IF NOT EXISTS idx_agenda_acciones_prospecto_fecha
  ON public.agenda_comercial_acciones (prospecto_id, fecha_hora DESC);

CREATE INDEX IF NOT EXISTS idx_agenda_acciones_tenant_fecha
  ON public.agenda_comercial_acciones (tenant_empresa_id, fecha_hora);

ALTER TABLE public.agenda_comercial_prospectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_comercial_contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_comercial_acciones ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_comercial_prospectos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_comercial_contactos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_comercial_acciones TO authenticated;
GRANT ALL ON public.agenda_comercial_prospectos TO service_role;
GRANT ALL ON public.agenda_comercial_contactos TO service_role;
GRANT ALL ON public.agenda_comercial_acciones TO service_role;

-- Prospectos
DROP POLICY IF EXISTS acp_sel ON public.agenda_comercial_prospectos;
DROP POLICY IF EXISTS acp_ins ON public.agenda_comercial_prospectos;
DROP POLICY IF EXISTS acp_upd ON public.agenda_comercial_prospectos;
DROP POLICY IF EXISTS acp_del ON public.agenda_comercial_prospectos;

CREATE POLICY acp_sel ON public.agenda_comercial_prospectos
  FOR SELECT TO authenticated
  USING (public.user_can_access_empresa(tenant_empresa_id));

CREATE POLICY acp_ins ON public.agenda_comercial_prospectos
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_empresa(tenant_empresa_id));

CREATE POLICY acp_upd ON public.agenda_comercial_prospectos
  FOR UPDATE TO authenticated
  USING (public.user_can_access_empresa(tenant_empresa_id))
  WITH CHECK (public.user_can_access_empresa(tenant_empresa_id));

CREATE POLICY acp_del ON public.agenda_comercial_prospectos
  FOR DELETE TO authenticated
  USING (public.user_can_access_empresa(tenant_empresa_id));

-- Contactos
DROP POLICY IF EXISTS acc_sel ON public.agenda_comercial_contactos;
DROP POLICY IF EXISTS acc_ins ON public.agenda_comercial_contactos;
DROP POLICY IF EXISTS acc_upd ON public.agenda_comercial_contactos;
DROP POLICY IF EXISTS acc_del ON public.agenda_comercial_contactos;

CREATE POLICY acc_sel ON public.agenda_comercial_contactos
  FOR SELECT TO authenticated
  USING (public.user_can_access_empresa(tenant_empresa_id));

CREATE POLICY acc_ins ON public.agenda_comercial_contactos
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_empresa(tenant_empresa_id));

CREATE POLICY acc_upd ON public.agenda_comercial_contactos
  FOR UPDATE TO authenticated
  USING (public.user_can_access_empresa(tenant_empresa_id))
  WITH CHECK (public.user_can_access_empresa(tenant_empresa_id));

CREATE POLICY acc_del ON public.agenda_comercial_contactos
  FOR DELETE TO authenticated
  USING (public.user_can_access_empresa(tenant_empresa_id));

-- Acciones / citas
DROP POLICY IF EXISTS aca_sel ON public.agenda_comercial_acciones;
DROP POLICY IF EXISTS aca_ins ON public.agenda_comercial_acciones;
DROP POLICY IF EXISTS aca_upd ON public.agenda_comercial_acciones;
DROP POLICY IF EXISTS aca_del ON public.agenda_comercial_acciones;

CREATE POLICY aca_sel ON public.agenda_comercial_acciones
  FOR SELECT TO authenticated
  USING (public.user_can_access_empresa(tenant_empresa_id));

CREATE POLICY aca_ins ON public.agenda_comercial_acciones
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_empresa(tenant_empresa_id));

CREATE POLICY aca_upd ON public.agenda_comercial_acciones
  FOR UPDATE TO authenticated
  USING (public.user_can_access_empresa(tenant_empresa_id))
  WITH CHECK (public.user_can_access_empresa(tenant_empresa_id));

CREATE POLICY aca_del ON public.agenda_comercial_acciones
  FOR DELETE TO authenticated
  USING (public.user_can_access_empresa(tenant_empresa_id));

COMMENT ON TABLE public.agenda_comercial_prospectos IS
  'Prospectos comerciales privados del tenant. No son clientes operativos ni empresas SaaS.';

-- <<< END supabase/migrations/20260701120000_agenda_comercial.sql


-- >>> FILE: supabase/migrations/20260706120000_admin_agenda_comercial.sql

-- Agenda comercial personal super_admin (Axis & Keel).
-- Sin tenant_empresa_id: no mezclar con CRM de empresas cliente.

CREATE OR REPLACE FUNCTION public.is_superadmin_agenda_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'jlopezasv@gmail.com'
    OR auth.uid() = '4b63a6e5-2e02-44e7-af61-b169583f40f5'::uuid;
$$;

COMMENT ON FUNCTION public.is_superadmin_agenda_user() IS
  'Acceso agenda comercial interna: email jlopezasv@gmail.com o UID panel propietario.';

REVOKE ALL ON FUNCTION public.is_superadmin_agenda_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_superadmin_agenda_user() TO authenticated;

CREATE TABLE IF NOT EXISTS public.admin_agenda_comercial_prospectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  cif text,
  direccion text,
  localidad text,
  provincia text,
  telefono text,
  email text,
  web text,
  sector text,
  estado_comercial text NOT NULL DEFAULT 'pendiente_contactar',
  num_camiones integer,
  tipos_vehiculos text[] NOT NULL DEFAULT '{}',
  tipos_rutas text[] NOT NULL DEFAULT '{}',
  sistemas_actuales text[] NOT NULL DEFAULT '{}',
  dolores text[] NOT NULL DEFAULT '{}',
  ultima_nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_agenda_comercial_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id uuid NOT NULL REFERENCES public.admin_agenda_comercial_prospectos (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  cargo text,
  telefono text,
  email text,
  whatsapp text,
  observaciones text,
  es_principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_agenda_comercial_acciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id uuid NOT NULL REFERENCES public.admin_agenda_comercial_prospectos (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  fecha_hora timestamptz NOT NULL,
  contacto_nombre text,
  resultado text,
  proxima_accion text,
  notas text,
  completada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_agenda_prospectos_updated
  ON public.admin_agenda_comercial_prospectos (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_agenda_contactos_prospecto
  ON public.admin_agenda_comercial_contactos (prospecto_id);

CREATE INDEX IF NOT EXISTS idx_admin_agenda_acciones_prospecto_fecha
  ON public.admin_agenda_comercial_acciones (prospecto_id, fecha_hora DESC);

ALTER TABLE public.admin_agenda_comercial_prospectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_agenda_comercial_contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_agenda_comercial_acciones ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_agenda_comercial_prospectos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_agenda_comercial_contactos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_agenda_comercial_acciones TO authenticated;
GRANT ALL ON public.admin_agenda_comercial_prospectos TO service_role;
GRANT ALL ON public.admin_agenda_comercial_contactos TO service_role;
GRANT ALL ON public.admin_agenda_comercial_acciones TO service_role;

-- Prospectos
DROP POLICY IF EXISTS aacp_sel ON public.admin_agenda_comercial_prospectos;
DROP POLICY IF EXISTS aacp_ins ON public.admin_agenda_comercial_prospectos;
DROP POLICY IF EXISTS aacp_upd ON public.admin_agenda_comercial_prospectos;
DROP POLICY IF EXISTS aacp_del ON public.admin_agenda_comercial_prospectos;

CREATE POLICY aacp_sel ON public.admin_agenda_comercial_prospectos
  FOR SELECT TO authenticated
  USING (public.is_superadmin_agenda_user());

CREATE POLICY aacp_ins ON public.admin_agenda_comercial_prospectos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin_agenda_user());

CREATE POLICY aacp_upd ON public.admin_agenda_comercial_prospectos
  FOR UPDATE TO authenticated
  USING (public.is_superadmin_agenda_user())
  WITH CHECK (public.is_superadmin_agenda_user());

CREATE POLICY aacp_del ON public.admin_agenda_comercial_prospectos
  FOR DELETE TO authenticated
  USING (public.is_superadmin_agenda_user());

-- Contactos
DROP POLICY IF EXISTS aacc_sel ON public.admin_agenda_comercial_contactos;
DROP POLICY IF EXISTS aacc_ins ON public.admin_agenda_comercial_contactos;
DROP POLICY IF EXISTS aacc_upd ON public.admin_agenda_comercial_contactos;
DROP POLICY IF EXISTS aacc_del ON public.admin_agenda_comercial_contactos;

CREATE POLICY aacc_sel ON public.admin_agenda_comercial_contactos
  FOR SELECT TO authenticated
  USING (public.is_superadmin_agenda_user());

CREATE POLICY aacc_ins ON public.admin_agenda_comercial_contactos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin_agenda_user());

CREATE POLICY aacc_upd ON public.admin_agenda_comercial_contactos
  FOR UPDATE TO authenticated
  USING (public.is_superadmin_agenda_user())
  WITH CHECK (public.is_superadmin_agenda_user());

CREATE POLICY aacc_del ON public.admin_agenda_comercial_contactos
  FOR DELETE TO authenticated
  USING (public.is_superadmin_agenda_user());

-- Acciones
DROP POLICY IF EXISTS aaca_sel ON public.admin_agenda_comercial_acciones;
DROP POLICY IF EXISTS aaca_ins ON public.admin_agenda_comercial_acciones;
DROP POLICY IF EXISTS aaca_upd ON public.admin_agenda_comercial_acciones;
DROP POLICY IF EXISTS aaca_del ON public.admin_agenda_comercial_acciones;

CREATE POLICY aaca_sel ON public.admin_agenda_comercial_acciones
  FOR SELECT TO authenticated
  USING (public.is_superadmin_agenda_user());

CREATE POLICY aaca_ins ON public.admin_agenda_comercial_acciones
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin_agenda_user());

CREATE POLICY aaca_upd ON public.admin_agenda_comercial_acciones
  FOR UPDATE TO authenticated
  USING (public.is_superadmin_agenda_user())
  WITH CHECK (public.is_superadmin_agenda_user());

CREATE POLICY aaca_del ON public.admin_agenda_comercial_acciones
  FOR DELETE TO authenticated
  USING (public.is_superadmin_agenda_user());

COMMENT ON TABLE public.admin_agenda_comercial_prospectos IS
  'Oportunidades comerciales internas Axis & Keel. Solo super_admin. Sin empresa_id.';

-- <<< END supabase/migrations/20260706120000_admin_agenda_comercial.sql


-- >>> FILE: supabase/migrations/20260707120000_agenda_prospecto_campos_comerciales.sql

-- Campos comerciales en prospectos (admin + tenant legacy).

ALTER TABLE public.admin_agenda_comercial_prospectos
  ADD COLUMN IF NOT EXISTS persona_contacto text,
  ADD COLUMN IF NOT EXISTS acuerdos_compromisos text,
  ADD COLUMN IF NOT EXISTS precio_orientativo text;

ALTER TABLE public.agenda_comercial_prospectos
  ADD COLUMN IF NOT EXISTS persona_contacto text,
  ADD COLUMN IF NOT EXISTS acuerdos_compromisos text,
  ADD COLUMN IF NOT EXISTS precio_orientativo text;

-- <<< END supabase/migrations/20260707120000_agenda_prospecto_campos_comerciales.sql


-- >>> FILE: supabase/migrations/20260708120000_data_retention_framework.sql

-- =============================================================================
-- Marco de retención de datos — preparación (sin borrados, sin cron).
-- GPS, OCR/CMR, fotos, documentos, expedientes operacionales.
-- Estados: ACTIVO | ARCHIVADO | BORRABLE
-- purge_enabled = false hasta activación manual futura.
-- =============================================================================

-- ─── Admin gate (reutiliza criterio super_admin) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.is_retention_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin_agenda_user();
$$;

REVOKE ALL ON FUNCTION public.is_retention_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_retention_admin() TO authenticated;

-- ─── Meta framework ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_framework_meta (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.retention_framework_meta (key, value)
VALUES (
  'framework',
  jsonb_build_object(
    'version', 1,
    'purge_enabled', false,
    'description', 'Marco de retención — simulación activa, borrado desactivado'
  )
)
ON CONFLICT (key) DO NOTHING;

-- ─── Catálogo de clases de activo ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_asset_catalog (
  asset_class text PRIMARY KEY,
  label text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('RETENIDO', 'ARCHIVABLE', 'ELIMINABLE')),
  entity_hint text,
  includes_storage boolean NOT NULL DEFAULT false,
  description text
);

INSERT INTO public.retention_asset_catalog (asset_class, label, tier, entity_hint, includes_storage, description)
VALUES
  ('servicio_metadata', 'Metadatos servicio / expediente', 'RETENIDO', 'servicios', false,
   'Referencia operativa y legal; no se purga automáticamente.'),
  ('documentacion_envios', 'Log envíos email documentación', 'RETENIDO', 'documentacion_envios', false,
   'Auditoría de comunicaciones con cliente.'),
  ('evidencia_cmr_ocr', 'CMR + OCR', 'RETENIDO', 'evidencias', true,
   'Imagen CMR y JSON OCR en evidencias.datos.'),
  ('evidencia_foto', 'Fotos parada', 'ARCHIVABLE', 'evidencias', true,
   'Fotos comprimidas en bucket user-photos.'),
  ('evidencia_pdf', 'PDF operativo', 'ARCHIVABLE', 'evidencias', true,
   'PDF en paradas o extras.'),
  ('servicio_documentos_extra', 'Documentos extra viaje', 'ARCHIVABLE', 'servicio_documentos_extra', true,
   'Archivos no ligados a stop.'),
  ('servicio_documentos_empresa', 'Documentos empresa', 'ARCHIVABLE', 'servicio_documentos_empresa', true,
   'Documentación corporativa del servicio.'),
  ('gps_ubicacion_viva', 'GPS posición actual', 'RETENIDO', 'ubicaciones', false,
   'Última posición por conductor (UPSERT).'),
  ('gps_trazas_historicas', 'Trazas GPS históricas', 'ELIMINABLE', 'ubicaciones', false,
   'Reservado para series densas futuras.'),
  ('incidencia_nota', 'Incidencias / notas texto', 'RETENIDO', 'evidencias', false,
   'Texto sin binario pesado.'),
  ('perfil_foto', 'Foto perfil conductor', 'ARCHIVABLE', 'profiles', true,
   'Avatar en storage.')
ON CONFLICT (asset_class) DO NOTHING;

-- ─── Política por clase (días) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_policy_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global', 'empresa')),
  empresa_id uuid REFERENCES public.empresas (id) ON DELETE CASCADE,
  asset_class text NOT NULL REFERENCES public.retention_asset_catalog (asset_class),
  days_until_archivable integer NOT NULL DEFAULT 0,
  days_until_borable integer NOT NULL DEFAULT 0,
  min_retention_days integer NOT NULL DEFAULT 0,
  purge_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_policy_scope_empresa_chk CHECK (
    (scope = 'global' AND empresa_id IS NULL)
    OR (scope = 'empresa' AND empresa_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policy_global_asset
  ON public.retention_policy_config (asset_class)
  WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_policy_empresa_asset
  ON public.retention_policy_config (empresa_id, asset_class)
  WHERE scope = 'empresa';

-- Defaults globales (días desde cierre de servicio salvo RETENIDO)
INSERT INTO public.retention_policy_config (
  scope, empresa_id, asset_class,
  days_until_archivable, days_until_borable, min_retention_days, purge_enabled, notes
)
SELECT v.scope, v.empresa_id, v.asset_class, v.da, v.db, v.mn, false, v.notes
FROM (VALUES
  ('global'::text, NULL::uuid, 'servicio_metadata', 0, 0, 0, 'Siempre ACTIVO'),
  ('global', NULL, 'documentacion_envios', 0, 0, 2555, '7 años mínimo sugerido'),
  ('global', NULL, 'evidencia_cmr_ocr', 365, 1825, 730, '2 años activo; archivo hasta 5'),
  ('global', NULL, 'evidencia_foto', 180, 545, 365, '6m activo tras cierre; 18m archivo'),
  ('global', NULL, 'evidencia_pdf', 180, 545, 365, 'Igual que fotos'),
  ('global', NULL, 'servicio_documentos_extra', 180, 545, 365, NULL),
  ('global', NULL, 'servicio_documentos_empresa', 365, 1095, 730, NULL),
  ('global', NULL, 'gps_ubicacion_viva', 0, 0, 0, 'Siempre ACTIVO'),
  ('global', NULL, 'gps_trazas_historicas', 90, 365, 30, 'Solo si se activa histórico'),
  ('global', NULL, 'incidencia_nota', 730, 0, 365, '2 años activo mínimo'),
  ('global', NULL, 'perfil_foto', 365, 1095, 180, 'Tras perfil archivado')
) AS v(scope, empresa_id, asset_class, da, db, mn, notes)
ON CONFLICT DO NOTHING;

-- ─── Log simulaciones (dry-run) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_simulation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas (id) ON DELETE SET NULL,
  run_by uuid,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retention_simulation_created
  ON public.retention_simulation_log (created_at DESC);

-- ─── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retention_servicio_reference_at(s public.servicios)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(s.updated_at, s.created_at);
$$;

CREATE OR REPLACE FUNCTION public.retention_servicio_is_closed(estado text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(estado, '')) IN ('completado', 'cerrado', 'cancelado', 'anulado');
$$;

CREATE OR REPLACE FUNCTION public.retention_estimate_evidencia_bytes(e public.evidencias)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF((e.datos -> 'doc_meta' ->> 'size_original_bytes')::bigint, 0),
    NULLIF((e.datos -> 'doc_meta' ->> 'size_bytes')::bigint, 0),
    NULLIF((e.datos -> 'doc_meta' ->> 'size_preview_bytes')::bigint, 0),
    CASE WHEN e.url IS NOT NULL AND e.url <> '' THEN 51200 ELSE 1024 END
  );
$$;

CREATE OR REPLACE FUNCTION public.retention_compute_state(
  p_tier text,
  p_servicio_cerrado boolean,
  p_age_days integer,
  p_days_archivable integer,
  p_days_borable integer,
  p_min_retention integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_tier = 'RETENIDO' THEN
    RETURN 'ACTIVO';
  END IF;
  IF NOT p_servicio_cerrado THEN
    RETURN 'ACTIVO';
  END IF;
  IF p_age_days < GREATEST(p_min_retention, 0) THEN
    RETURN 'ACTIVO';
  END IF;
  IF p_age_days < GREATEST(p_days_archivable, 0) THEN
    RETURN 'ACTIVO';
  END IF;
  IF p_tier = 'ELIMINABLE' AND p_age_days >= GREATEST(p_days_archivable + p_days_borable, p_days_borable) THEN
    RETURN 'BORRABLE';
  END IF;
  IF p_tier = 'ARCHIVABLE' AND p_days_borable > 0
     AND p_age_days >= GREATEST(p_days_archivable + p_days_borable, p_days_archivable) THEN
    RETURN 'BORRABLE';
  END IF;
  IF p_age_days >= GREATEST(p_days_archivable, 0) THEN
    RETURN 'ARCHIVADO';
  END IF;
  RETURN 'ACTIVO';
END;
$$;

-- ─── Vista métricas (solo lectura, sin mutar datos) ──────────────────────────
CREATE OR REPLACE VIEW public.v_retention_metrics_summary AS
WITH policy AS (
  SELECT asset_class, days_until_archivable, days_until_borable, min_retention_days, purge_enabled
  FROM public.retention_policy_config
  WHERE scope = 'global'
),
evidencias_rows AS (
  SELECT
    sv.empresa_id,
    CASE
      WHEN e.tipo = 'cmr' THEN 'evidencia_cmr_ocr'
      WHEN e.tipo = 'foto' THEN 'evidencia_foto'
      WHEN e.tipo IN ('incidencia', 'nota') THEN 'incidencia_nota'
      WHEN (e.datos -> 'doc_meta' ->> 'mime_type') ILIKE '%pdf%'
        OR coalesce(e.url, '') ILIKE '%.pdf%' THEN 'evidencia_pdf'
      ELSE 'evidencia_foto'
    END AS asset_class,
    public.retention_compute_state(
      c.tier,
      public.retention_servicio_is_closed(sv.estado),
      GREATEST(0, (EXTRACT(epoch FROM (now() - public.retention_servicio_reference_at(sv))) / 86400)::integer),
      coalesce(p.days_until_archivable, 0),
      coalesce(p.days_until_borable, 0),
      coalesce(p.min_retention_days, 0)
    ) AS retention_state,
    public.retention_estimate_evidencia_bytes(e) AS estimated_bytes
  FROM public.evidencias e
  INNER JOIN public.stops st ON st.id = e.stop_id
  INNER JOIN public.servicios sv ON sv.id = st.servicio_id
  INNER JOIN public.retention_asset_catalog c ON c.asset_class = CASE
      WHEN e.tipo = 'cmr' THEN 'evidencia_cmr_ocr'
      WHEN e.tipo = 'foto' THEN 'evidencia_foto'
      WHEN e.tipo IN ('incidencia', 'nota') THEN 'incidencia_nota'
      WHEN (e.datos -> 'doc_meta' ->> 'mime_type') ILIKE '%pdf%'
        OR coalesce(e.url, '') ILIKE '%.pdf%' THEN 'evidencia_pdf'
      ELSE 'evidencia_foto'
    END
  LEFT JOIN policy p ON p.asset_class = c.asset_class
  WHERE sv.empresa_id IS NOT NULL
),
extra_rows AS (
  SELECT
    sv.empresa_id,
    'servicio_documentos_extra'::text AS asset_class,
    public.retention_compute_state(
      c.tier,
      public.retention_servicio_is_closed(sv.estado),
      GREATEST(0, (EXTRACT(epoch FROM (now() - public.retention_servicio_reference_at(sv))) / 86400)::integer),
      coalesce(p.days_until_archivable, 0),
      coalesce(p.days_until_borable, 0),
      coalesce(p.min_retention_days, 0)
    ) AS retention_state,
    coalesce(sde.size_bytes, 65536)::bigint AS estimated_bytes
  FROM public.servicio_documentos_extra sde
  INNER JOIN public.servicios sv ON sv.id = sde.servicio_id
  INNER JOIN public.retention_asset_catalog c ON c.asset_class = 'servicio_documentos_extra'
  LEFT JOIN policy p ON p.asset_class = 'servicio_documentos_extra'
  WHERE sv.empresa_id IS NOT NULL
),
envios_rows AS (
  SELECT
    sv.empresa_id,
    'documentacion_envios'::text AS asset_class,
    'ACTIVO'::text AS retention_state,
    (length(coalesce(de.destinatarios, '')) + length(coalesce(de.asunto, '')) + length(coalesce(de.mensaje, '')))::bigint AS estimated_bytes
  FROM public.documentacion_envios de
  INNER JOIN public.servicios sv ON sv.id = de.servicio_id
  WHERE sv.empresa_id IS NOT NULL
),
servicio_meta_rows AS (
  SELECT
    sv.empresa_id,
    'servicio_metadata'::text AS asset_class,
    'ACTIVO'::text AS retention_state,
    2048::bigint AS estimated_bytes
  FROM public.servicios sv
  WHERE sv.empresa_id IS NOT NULL
),
ubicaciones_rows AS (
  SELECT
    ce.empresa_id,
    'gps_ubicacion_viva'::text AS asset_class,
    'ACTIVO'::text AS retention_state,
    512::bigint AS estimated_bytes
  FROM public.ubicaciones u
  INNER JOIN public.conductor_empresa ce ON ce.user_id = u.user_id AND ce.activo = true
  WHERE ce.empresa_id IS NOT NULL
),
unioned AS (
  SELECT * FROM evidencias_rows
  UNION ALL SELECT * FROM extra_rows
  UNION ALL SELECT * FROM envios_rows
  UNION ALL SELECT * FROM servicio_meta_rows
  UNION ALL SELECT * FROM ubicaciones_rows
)
SELECT
  empresa_id,
  asset_class,
  retention_state,
  count(*)::bigint AS item_count,
  coalesce(sum(estimated_bytes), 0)::bigint AS estimated_bytes
FROM unioned
GROUP BY empresa_id, asset_class, retention_state;

-- ─── Simulación (NO borra) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retention_run_simulation(
  p_empresa_id uuid DEFAULT NULL,
  p_override_days jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_by_state jsonb;
  v_by_class jsonb;
  v_total_borable_bytes bigint;
  v_purge_enabled boolean;
BEGIN
  IF NOT public.is_retention_admin() THEN
    RAISE EXCEPTION 'retention_run_simulation: acceso denegado' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce((value ->> 'purge_enabled')::boolean, false)
  INTO v_purge_enabled
  FROM public.retention_framework_meta
  WHERE key = 'framework';

  SELECT coalesce(sum(estimated_bytes), 0)
  INTO v_total_borable_bytes
  FROM public.v_retention_metrics_summary m
  WHERE m.retention_state = 'BORRABLE'
    AND (p_empresa_id IS NULL OR m.empresa_id = p_empresa_id);

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_by_state
  FROM (
    SELECT retention_state, sum(item_count) AS items, sum(estimated_bytes) AS bytes
    FROM public.v_retention_metrics_summary m
    WHERE p_empresa_id IS NULL OR m.empresa_id = p_empresa_id
    GROUP BY retention_state
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_by_class
  FROM (
    SELECT asset_class, retention_state, sum(item_count) AS items, sum(estimated_bytes) AS bytes
    FROM public.v_retention_metrics_summary m
    WHERE p_empresa_id IS NULL OR m.empresa_id = p_empresa_id
    GROUP BY asset_class, retention_state
    ORDER BY asset_class, retention_state
  ) t;

  v_result := jsonb_build_object(
    'dry_run', true,
    'purge_enabled', v_purge_enabled,
    'would_delete', false,
    'empresa_id', p_empresa_id,
    'reclaimable_bytes', v_total_borable_bytes,
    'reclaimable_human', pg_size_pretty(v_total_borable_bytes),
    'by_state', v_by_state,
    'by_class', v_by_class,
    'simulated_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'override_days', p_override_days
  );

  INSERT INTO public.retention_simulation_log (empresa_id, run_by, parameters, result)
  VALUES (
    p_empresa_id,
    auth.uid(),
    jsonb_build_object('override_days', p_override_days),
    v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.retention_run_simulation(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retention_run_simulation(uuid, jsonb) TO authenticated;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.retention_framework_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_asset_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_policy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_simulation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rfm_sel ON public.retention_framework_meta;
CREATE POLICY rfm_sel ON public.retention_framework_meta FOR SELECT TO authenticated
  USING (public.is_retention_admin());
DROP POLICY IF EXISTS rfm_all ON public.retention_framework_meta;
CREATE POLICY rfm_all ON public.retention_framework_meta FOR ALL TO authenticated
  USING (public.is_retention_admin()) WITH CHECK (public.is_retention_admin());

DROP POLICY IF EXISTS rac_sel ON public.retention_asset_catalog;
CREATE POLICY rac_sel ON public.retention_asset_catalog FOR SELECT TO authenticated
  USING (public.is_retention_admin());

DROP POLICY IF EXISTS rpc_sel ON public.retention_policy_config;
CREATE POLICY rpc_sel ON public.retention_policy_config FOR SELECT TO authenticated
  USING (public.is_retention_admin());
DROP POLICY IF EXISTS rpc_all ON public.retention_policy_config;
CREATE POLICY rpc_all ON public.retention_policy_config FOR ALL TO authenticated
  USING (public.is_retention_admin()) WITH CHECK (public.is_retention_admin());

DROP POLICY IF EXISTS rsl_sel ON public.retention_simulation_log;
CREATE POLICY rsl_sel ON public.retention_simulation_log FOR SELECT TO authenticated
  USING (public.is_retention_admin());
DROP POLICY IF EXISTS rsl_ins ON public.retention_simulation_log;
CREATE POLICY rsl_ins ON public.retention_simulation_log FOR INSERT TO authenticated
  WITH CHECK (public.is_retention_admin());

GRANT SELECT ON public.v_retention_metrics_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retention_framework_meta TO authenticated;
GRANT SELECT ON public.retention_asset_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retention_policy_config TO authenticated;
GRANT SELECT, INSERT ON public.retention_simulation_log TO authenticated;

COMMENT ON TABLE public.retention_policy_config IS
  'Días de retención por clase de dato. purge_enabled=false: solo simulación.';
COMMENT ON FUNCTION public.retention_run_simulation IS
  'Simula espacio liberable. NO elimina filas ni objetos storage.';

-- <<< END supabase/migrations/20260708120000_data_retention_framework.sql


-- >>> FILE: supabase/migrations/20260709120000_dcdt_master_partes.sql

-- =============================================================================
-- DCDT — master_partes_transporte + documento por servicio (dcdt_servicio)
-- Sin duplicar datos: referencias + overrides mínimos en JSON
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.master_partes_transporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('cargador', 'expedidor', 'destinatario', 'operador')),
  nombre text NOT NULL,
  nif text,
  domicilio_fiscal text,
  direccion_operativa text,
  ciudad text,
  codigo_postal text,
  pais text DEFAULT 'ES',
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_partes_nombre_min CHECK (char_length(trim(nombre)) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_master_partes_empresa_tipo
  ON public.master_partes_transporte (empresa_id, tipo)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_master_partes_empresa_nombre
  ON public.master_partes_transporte (empresa_id, lower(nombre));

COMMENT ON TABLE public.master_partes_transporte IS
  'Catálogo de partes (cargador, destinatario, operador) por empresa. Fuente para DCDT.';

CREATE TABLE IF NOT EXISTS public.dcdt_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL UNIQUE REFERENCES public.servicios (id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN (
      'borrador',
      'incompleto',
      'pendiente_ocr',
      'pendiente_validacion',
      'validado',
      'incluido_en_expediente'
    )),
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  validado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  validado_at timestamptz,
  pdf_generado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dcdt_empresa
  ON public.dcdt_servicio (empresa_id, updated_at DESC);

COMMENT ON TABLE public.dcdt_servicio IS
  'DCDT por servicio: referencias master + mercancía + OCR. Tráfico valida antes de expediente.';

COMMENT ON COLUMN public.dcdt_servicio.datos IS
  'JSON: partes{*_id, *_overrides}, mercancia{}, stops[], ocr_ultimo, observaciones';

CREATE OR REPLACE FUNCTION public.user_can_manage_dcdt_trafico(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1 FROM public.empresas e
    WHERE e.id = p_empresa_id AND e.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.rol IN ('jefe_flota', 'trafico')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_is_servicio_conductor(p_servicio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servicios s
    WHERE s.id = p_servicio_id AND s.conductor_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) TO authenticated;

ALTER TABLE public.master_partes_transporte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mpt_sel ON public.master_partes_transporte;
CREATE POLICY mpt_sel ON public.master_partes_transporte
  FOR SELECT TO authenticated
  USING (
    public.user_is_active_office_peer(empresa_id)
    OR EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = empresa_id AND e.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.conductor_empresa ce
      WHERE ce.empresa_id = master_partes_transporte.empresa_id
        AND ce.user_id = auth.uid()
        AND ce.activo = true
    )
  );

DROP POLICY IF EXISTS mpt_ins ON public.master_partes_transporte;
CREATE POLICY mpt_ins ON public.master_partes_transporte
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

DROP POLICY IF EXISTS mpt_upd ON public.master_partes_transporte;
CREATE POLICY mpt_upd ON public.master_partes_transporte
  FOR UPDATE TO authenticated
  USING (public.user_can_manage_dcdt_trafico(empresa_id))
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

GRANT SELECT, INSERT, UPDATE ON public.master_partes_transporte TO authenticated;

ALTER TABLE public.dcdt_servicio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dcdt_sel ON public.dcdt_servicio;
CREATE POLICY dcdt_sel ON public.dcdt_servicio
  FOR SELECT TO authenticated
  USING (
    public.user_can_manage_dcdt_trafico(empresa_id)
    OR public.user_is_servicio_conductor(servicio_id)
    OR EXISTS (
      SELECT 1 FROM public.empresas e
      WHERE e.id = empresa_id AND e.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS dcdt_ins ON public.dcdt_servicio;
CREATE POLICY dcdt_ins ON public.dcdt_servicio
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

DROP POLICY IF EXISTS dcdt_upd_trafico ON public.dcdt_servicio;
CREATE POLICY dcdt_upd_trafico ON public.dcdt_servicio
  FOR UPDATE TO authenticated
  USING (public.user_can_manage_dcdt_trafico(empresa_id))
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

DROP POLICY IF EXISTS dcdt_upd_conductor ON public.dcdt_servicio;
CREATE POLICY dcdt_upd_conductor ON public.dcdt_servicio
  FOR UPDATE TO authenticated
  USING (public.user_is_servicio_conductor(servicio_id))
  WITH CHECK (public.user_is_servicio_conductor(servicio_id));

GRANT SELECT, INSERT, UPDATE ON public.dcdt_servicio TO authenticated;

-- <<< END supabase/migrations/20260709120000_dcdt_master_partes.sql


-- >>> FILE: supabase/migrations/20260710120000_dcdt_rename_from_carta_porte.sql

-- Renombrar carta_porte_servicio → dcdt_servicio (solo si existe la tabla antigua)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'carta_porte_servicio'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dcdt_servicio'
  ) THEN
    ALTER TABLE public.carta_porte_servicio RENAME TO dcdt_servicio;
    ALTER INDEX IF EXISTS idx_carta_porte_empresa RENAME TO idx_dcdt_empresa;
  END IF;
END $$;

-- Migrar estados antiguos
UPDATE public.dcdt_servicio SET estado = 'validado'
  WHERE estado IN ('validado_trafico', 'pdf_generado');
UPDATE public.dcdt_servicio SET estado = 'pendiente_validacion'
  WHERE estado = 'borrador' AND datos IS NOT NULL AND datos <> '{}'::jsonb;

-- Actualizar constraint de estados
ALTER TABLE public.dcdt_servicio DROP CONSTRAINT IF EXISTS carta_porte_servicio_estado_check;
ALTER TABLE public.dcdt_servicio DROP CONSTRAINT IF EXISTS dcdt_servicio_estado_check;
ALTER TABLE public.dcdt_servicio ADD CONSTRAINT dcdt_servicio_estado_check
  CHECK (estado IN (
    'borrador', 'incompleto', 'pendiente_ocr', 'pendiente_validacion',
    'validado', 'incluido_en_expediente'
  ));

COMMENT ON TABLE public.dcdt_servicio IS
  'DCDT por servicio (Documento de Control del Transporte, Orden FOM/2861/2012).';

-- RLS: reemplazar políticas antiguas
DROP POLICY IF EXISTS cps_sel ON public.dcdt_servicio;
DROP POLICY IF EXISTS cps_ins ON public.dcdt_servicio;
DROP POLICY IF EXISTS cps_upd_trafico ON public.dcdt_servicio;
DROP POLICY IF EXISTS cps_upd_conductor ON public.dcdt_servicio;

CREATE OR REPLACE FUNCTION public.user_can_manage_dcdt_trafico(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN RETURN false; END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id AND e.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id AND eu.user_id = auth.uid()
      AND eu.activo = true AND eu.rol IN ('jefe_flota', 'trafico')
  );
END;
$$;

DROP POLICY IF EXISTS dcdt_sel ON public.dcdt_servicio;
CREATE POLICY dcdt_sel ON public.dcdt_servicio FOR SELECT TO authenticated
  USING (
    public.user_can_manage_dcdt_trafico(empresa_id)
    OR public.user_is_servicio_conductor(servicio_id)
    OR EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS dcdt_ins ON public.dcdt_servicio;
CREATE POLICY dcdt_ins ON public.dcdt_servicio FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

DROP POLICY IF EXISTS dcdt_upd_trafico ON public.dcdt_servicio;
CREATE POLICY dcdt_upd_trafico ON public.dcdt_servicio FOR UPDATE TO authenticated
  USING (public.user_can_manage_dcdt_trafico(empresa_id))
  WITH CHECK (public.user_can_manage_dcdt_trafico(empresa_id));

DROP POLICY IF EXISTS dcdt_upd_conductor ON public.dcdt_servicio;
CREATE POLICY dcdt_upd_conductor ON public.dcdt_servicio FOR UPDATE TO authenticated
  USING (public.user_is_servicio_conductor(servicio_id))
  WITH CHECK (public.user_is_servicio_conductor(servicio_id));

DROP FUNCTION IF EXISTS public.user_can_manage_carta_porte_trafico(uuid);

-- <<< END supabase/migrations/20260710120000_dcdt_rename_from_carta_porte.sql


-- >>> FILE: supabase/migrations/20260710130000_fix_dcdt_rls_function_volatility.sql

-- =============================================================================
-- Fix user_can_manage_dcdt_trafico — STABLE + SET LOCAL no permitido (0A000)
-- CREATE OR REPLACE (sin DROP): las políticas RLS siguen enlazadas a la función.
-- Misma lógica; solo VOLATILE y sin SET LOCAL dentro del cuerpo.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_can_manage_dcdt_trafico(p_empresa_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.empresas e
    WHERE e.id = p_empresa_id
      AND e.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.rol IN ('jefe_flota', 'trafico')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_dcdt_trafico(uuid) TO authenticated;

-- <<< END supabase/migrations/20260710130000_fix_dcdt_rls_function_volatility.sql


-- >>> FILE: supabase/migrations/20260710140000_empresas_domicilio_dcdt.sql

-- DEMO / prod-safe: domicilio fiscal transportista en empresas (DCDT)
-- Sincronizable desde perfil de empresa; fallback sigue siendo profiles del owner.

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RAISE NOTICE 'empresas: omitido domicilio DCDT';
    RETURN;
  END IF;

  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS direccion text;
  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cp text;
  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS ciudad text;
  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS domicilio_fiscal text;

  COMMENT ON COLUMN public.empresas.direccion IS 'Dirección / domicilio fiscal (DCDT transportista)';
  COMMENT ON COLUMN public.empresas.domicilio_fiscal IS 'Alias domicilio fiscal si difiere de direccion';
END $$;

-- <<< END supabase/migrations/20260710140000_empresas_domicilio_dcdt.sql


-- >>> FILE: supabase/migrations/20260710150000_dcdt_pdf_retention_demo.sql

-- DEMO: retención mínima 365 días para PDF DCDT (servicio_documentos_extra.tipo = dcdt).
-- Alineado con esquema real de retention_asset_catalog / retention_policy_config
-- (migración 20260708120000_data_retention_framework.sql).
-- Ejecutar en Supabase DEMO si el framework de retención ya está aplicado.

INSERT INTO public.retention_asset_catalog (asset_class, label, tier, entity_hint, includes_storage, description)
VALUES (
  'dcdt_pdf',
  'PDF DCDT (documento legal)',
  'RETENIDO',
  'servicio_documentos_extra',
  true,
  'tipo=dcdt · conservación mínima 365 días (retention_until en datos JSON)'
)
ON CONFLICT (asset_class) DO UPDATE SET
  label = EXCLUDED.label,
  tier = EXCLUDED.tier,
  entity_hint = EXCLUDED.entity_hint,
  includes_storage = EXCLUDED.includes_storage,
  description = EXCLUDED.description;

INSERT INTO public.retention_policy_config (
  scope, empresa_id, asset_class,
  days_until_archivable, days_until_borable, min_retention_days, purge_enabled, notes
)
SELECT v.scope, v.empresa_id, v.asset_class, v.da, v.db, v.mn, false, v.notes
FROM (VALUES
  ('global'::text, NULL::uuid, 'dcdt_pdf', 0, 0, 365, 'DCDT legal — mínimo 365 días; purge desactivado')
) AS v(scope, empresa_id, asset_class, da, db, mn, notes)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.retention_policy_config rpc
  WHERE rpc.scope = 'global' AND rpc.asset_class = 'dcdt_pdf'
);

UPDATE public.retention_policy_config
SET
  min_retention_days = GREATEST(min_retention_days, 365),
  notes = COALESCE(notes, 'DCDT legal — mínimo 365 días; purge desactivado'),
  updated_at = now()
WHERE scope = 'global' AND asset_class = 'dcdt_pdf';

-- <<< END supabase/migrations/20260710150000_dcdt_pdf_retention_demo.sql


-- >>> FILE: supabase/migrations/20260712120000_dcdt_deca_public_id_demo.sql

-- DEMO: DeCA — identificador público estable por dcdt_servicio
-- Proyecto: cuaderno-demo-ab.vercel.app · Supabase fezacjtbavgdosncxlzw
-- Ejecutar solo en DEMO:
--   node scripts/apply-sql-file.mjs supabase/migrations/20260712120000_dcdt_deca_public_id_demo.sql
--
-- Semántica deca_public_id:
--   - Estable por fila dcdt_servicio; regeneración PDF in-place mantiene el mismo id → misma URL/QR.
--   - Nuevo uuid solo al emitir documento nuevo (futuro: nueva pdf_dcdt_version / nuevo QR).

ALTER TABLE public.dcdt_servicio
  ADD COLUMN IF NOT EXISTS deca_public_id uuid;

UPDATE public.dcdt_servicio
SET deca_public_id = gen_random_uuid()
WHERE deca_public_id IS NULL;

ALTER TABLE public.dcdt_servicio
  ALTER COLUMN deca_public_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN deca_public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dcdt_servicio_deca_public_id
  ON public.dcdt_servicio (deca_public_id);

COMMENT ON COLUMN public.dcdt_servicio.deca_public_id IS
  'UUID público estable (DeCA). URL canónica: /api/dcdt-download?id={deca_public_id}. '
  'Se conserva al regenerar PDF in-place; nuevo uuid solo en emisión de documento nuevo.';

-- <<< END supabase/migrations/20260712120000_dcdt_deca_public_id_demo.sql


-- >>> FILE: supabase/migrations/20260713120000_conductor_empresa_vehiculo_demo.sql

-- DEMO: matrícula remolque en flota empresa (autorrelleno DCDT art. 6).
-- matricula ya existe en conductor_empresa; remolque se añade aquí.

ALTER TABLE public.conductor_empresa
  ADD COLUMN IF NOT EXISTS remolque text;

COMMENT ON COLUMN public.conductor_empresa.remolque IS
  'Matrícula remolque/semirremolque asignado al conductor en la flota (DCDT art. 6).';

-- <<< END supabase/migrations/20260713120000_conductor_empresa_vehiculo_demo.sql


-- >>> FILE: supabase/migrations/20260719120000_soltar_parada_guarded_rpc.sql

-- Validación atómica por parada al soltar / finalizar participación (multi-conductor).
-- Replica conductorSeesStop + otherConductorsWhoSeeStop con FOR UPDATE anti-carrera.

-- ---------------------------------------------------------------------------
-- Helpers internos (no expuestos vía PostgREST)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stop_operational_group_internal(p_tipo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_tipo, '')) = 'carga' THEN 'carga'
    WHEN lower(coalesce(p_tipo, '')) = 'descarga' THEN 'descarga'
    WHEN lower(coalesce(p_tipo, '')) LIKE '%carga%'
      AND lower(coalesce(p_tipo, '')) LIKE '%descarga%' THEN 'carga_descarga'
    ELSE 'otra'
  END;
$$;

CREATE OR REPLACE FUNCTION public.stop_matches_participacion_tipo_internal(
  p_stop_tipo text,
  p_participacion_tipo text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_scope text;
  v_group text;
BEGIN
  v_scope := lower(coalesce(p_participacion_tipo, 'todo'));
  IF v_scope NOT IN ('solo_cargas', 'solo_descargas') THEN
    RETURN true;
  END IF;

  v_group := public.stop_operational_group_internal(p_stop_tipo);

  IF v_scope = 'solo_cargas' THEN
    RETURN v_group IN ('carga', 'carga_descarga');
  END IF;

  IF v_scope = 'solo_descargas' THEN
    RETURN v_group IN ('descarga', 'carga_descarga');
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.participacion_tipo_for_conductor_internal(
  p_servicio_id uuid,
  p_conductor_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT sa.participacion_tipo
      FROM public.servicio_asignaciones sa
      WHERE sa.servicio_id = p_servicio_id
        AND sa.conductor_id = p_conductor_id
        AND sa.stop_id IS NULL
        AND sa.participacion_tipo IS NOT NULL
      ORDER BY sa.created_at DESC
      LIMIT 1
    ),
    'todo'
  );
$$;

CREATE OR REPLACE FUNCTION public.pending_stop_display_label_internal(
  p_servicio_id uuid,
  p_stop_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH typed AS (
    SELECT
      s.id,
      trim(coalesce(s.nombre, s.direccion, '')) AS place,
      public.stop_operational_group_internal(s.tipo) AS type_group,
      s.orden,
      s.tipo
    FROM public.stops s
    WHERE s.servicio_id = p_servicio_id
  ),
  numbered AS (
    SELECT
      id,
      place,
      type_group,
      row_number() OVER (
        PARTITION BY type_group
        ORDER BY orden NULLS LAST, id
      ) AS type_ord
    FROM typed
  ),
  target AS (
    SELECT * FROM numbered WHERE id = p_stop_id
  )
  SELECT coalesce(
    CASE
      WHEN t.place <> '' THEN
        CASE t.type_group
          WHEN 'carga' THEN 'Carga ' || t.type_ord || ' · ' || t.place
          WHEN 'descarga' THEN 'Descarga ' || t.type_ord || ' · ' || t.place
          WHEN 'carga_descarga' THEN 'Carga/descarga ' || t.type_ord || ' · ' || t.place
          ELSE 'Parada ' || t.type_ord::text || ' · ' || t.place
        END
      ELSE
        CASE t.type_group
          WHEN 'carga' THEN 'Carga ' || t.type_ord
          WHEN 'descarga' THEN 'Descarga ' || t.type_ord
          WHEN 'carga_descarga' THEN 'Carga/descarga ' || t.type_ord
          ELSE 'Parada ' || t.type_ord::text
        END
    END,
    'Parada'
  )
  FROM target t;
$$;

CREATE OR REPLACE FUNCTION public.count_other_conductors_seeing_stop_internal(
  p_servicio_id uuid,
  p_excluding_conductor_id uuid,
  p_stop_id uuid,
  p_apply_participacion_tipo_filter boolean
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH servicio_row AS (
    SELECT conductor_id AS principal_id
    FROM public.servicios
    WHERE id = p_servicio_id
  ),
  whole_finalized AS (
    SELECT DISTINCT sa.conductor_id
    FROM public.servicio_asignaciones sa
    WHERE sa.servicio_id = p_servicio_id
      AND sa.stop_id IS NULL
      AND lower(sa.estado_participacion) = 'finalizado'
  ),
  pool AS (
    SELECT DISTINCT conductor_id
    FROM (
      SELECT sr.principal_id AS conductor_id
      FROM servicio_row sr
      WHERE sr.principal_id IS NOT NULL
      UNION ALL
      SELECT sa.conductor_id
      FROM public.servicio_asignaciones sa
      WHERE sa.servicio_id = p_servicio_id
    ) sub
    WHERE conductor_id IS NOT NULL
  ),
  active_conductors AS (
    SELECT p.conductor_id
    FROM pool p
    WHERE NOT EXISTS (
      SELECT 1
      FROM whole_finalized wf
      WHERE wf.conductor_id = p.conductor_id
    )
  ),
  stop_row AS (
    SELECT s.id, s.tipo
    FROM public.stops s
    WHERE s.id = p_stop_id
      AND s.servicio_id = p_servicio_id
  ),
  dropped AS (
    SELECT sa.conductor_id, sa.stop_id
    FROM public.servicio_asignaciones sa
    WHERE sa.servicio_id = p_servicio_id
      AND sa.stop_id IS NOT NULL
      AND lower(sa.estado_participacion) = 'finalizado'
  )
  SELECT count(*)::integer
  FROM active_conductors ac
  CROSS JOIN stop_row sr
  WHERE ac.conductor_id IS DISTINCT FROM p_excluding_conductor_id
    AND NOT EXISTS (
      SELECT 1
      FROM dropped d
      WHERE d.conductor_id = ac.conductor_id
        AND d.stop_id = p_stop_id
    )
    AND (
      NOT coalesce(p_apply_participacion_tipo_filter, false)
      OR public.stop_matches_participacion_tipo_internal(
        sr.tipo,
        public.participacion_tipo_for_conductor_internal(p_servicio_id, ac.conductor_id)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.stop_operational_group_internal(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stop_matches_participacion_tipo_internal(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participacion_tipo_for_conductor_internal(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pending_stop_display_label_internal(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_other_conductors_seeing_stop_internal(uuid, uuid, uuid, boolean) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- RPC: soltar una parada (exclusión personal + anti-huérfana)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soltar_parada_conductor_guarded(
  p_servicio_id uuid,
  p_conductor_id uuid,
  p_stop_id uuid,
  p_apply_participacion_tipo_filter boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_covering integer;
  v_stop record;
  v_already_dropped boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_conductor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT public.user_can_access_servicio(p_servicio_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  PERFORM s.id
  FROM public.servicios s
  WHERE s.id = p_servicio_id
  FOR UPDATE;

  PERFORM sa.id
  FROM public.servicio_asignaciones sa
  WHERE sa.servicio_id = p_servicio_id
  FOR UPDATE;

  SELECT s.id, s.tipo, s.estado, s.hora_salida_real
  INTO v_stop
  FROM public.stops s
  WHERE s.id = p_stop_id
    AND s.servicio_id = p_servicio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parada no encontrada';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.servicio_asignaciones sa
    WHERE sa.servicio_id = p_servicio_id
      AND sa.conductor_id = p_conductor_id
      AND sa.stop_id = p_stop_id
      AND lower(sa.estado_participacion) = 'finalizado'
  )
  INTO v_already_dropped;

  IF v_already_dropped THEN
    RETURN;
  END IF;

  IF v_stop.hora_salida_real IS NULL
     AND lower(coalesce(v_stop.estado, '')) <> 'completado' THEN
    v_covering := public.count_other_conductors_seeing_stop_internal(
      p_servicio_id,
      p_conductor_id,
      p_stop_id,
      p_apply_participacion_tipo_filter
    );

    IF v_covering = 0 THEN
      RAISE EXCEPTION
        'No puedes soltar esta parada: nadie más quedaría asignado a ella. Pide a tráfico que asigne otro conductor primero, o complétala tú mismo.';
    END IF;
  END IF;

  UPDATE public.servicio_asignaciones
  SET
    estado_participacion = 'finalizado',
    fecha_fin_participacion = v_now,
    tipo_asignacion = 'parada_renunciada'
  WHERE servicio_id = p_servicio_id
    AND conductor_id = p_conductor_id
    AND stop_id = p_stop_id;

  IF NOT FOUND THEN
    INSERT INTO public.servicio_asignaciones (
      servicio_id,
      conductor_id,
      stop_id,
      tipo_asignacion,
      estado_participacion,
      fecha_fin_participacion
    )
    VALUES (
      p_servicio_id,
      p_conductor_id,
      p_stop_id,
      'parada_renunciada',
      'finalizado',
      v_now
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.soltar_parada_conductor_guarded(uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soltar_parada_conductor_guarded(uuid, uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.soltar_parada_conductor_guarded(uuid, uuid, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.soltar_parada_conductor_guarded(uuid, uuid, uuid, boolean) IS
  'Exclusión personal de parada con validación anti-huérfana atómica (FOR UPDATE).';

-- ---------------------------------------------------------------------------
-- RPC: finalizar participación completa (valida cada parada pendiente visible)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalizar_participacion_conductor_guarded(
  p_servicio_id uuid,
  p_conductor_id uuid,
  p_apply_participacion_tipo_filter boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_covering integer;
  v_label text;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_conductor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT public.user_can_access_servicio(p_servicio_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  PERFORM s.id
  FROM public.servicios s
  WHERE s.id = p_servicio_id
  FOR UPDATE;

  PERFORM sa.id
  FROM public.servicio_asignaciones sa
  WHERE sa.servicio_id = p_servicio_id
  FOR UPDATE;

  FOR r IN
    SELECT
      s.id,
      s.tipo,
      s.estado,
      s.hora_salida_real,
      s.nombre,
      s.direccion,
      s.orden
    FROM public.stops s
    WHERE s.servicio_id = p_servicio_id
      AND s.hora_salida_real IS NULL
      AND lower(coalesce(s.estado, '')) <> 'completado'
      AND NOT EXISTS (
        SELECT 1
        FROM public.servicio_asignaciones sa
        WHERE sa.servicio_id = p_servicio_id
          AND sa.conductor_id = p_conductor_id
          AND sa.stop_id = s.id
          AND lower(sa.estado_participacion) = 'finalizado'
      )
      AND (
        NOT coalesce(p_apply_participacion_tipo_filter, false)
        OR public.stop_matches_participacion_tipo_internal(
          s.tipo,
          public.participacion_tipo_for_conductor_internal(p_servicio_id, p_conductor_id)
        )
      )
    ORDER BY s.orden NULLS LAST, s.id
  LOOP
    v_covering := public.count_other_conductors_seeing_stop_internal(
      p_servicio_id,
      p_conductor_id,
      r.id,
      p_apply_participacion_tipo_filter
    );

    IF v_covering = 0 THEN
      v_label := coalesce(
        public.pending_stop_display_label_internal(p_servicio_id, r.id),
        'Parada'
      );
      RAISE EXCEPTION
        'No puedes finalizar tu participación: % quedaría sin nadie asignado. Pide a tráfico que asigne otro conductor primero, o complétala tú mismo.',
        v_label;
    END IF;
  END LOOP;

  UPDATE public.servicio_asignaciones
  SET
    estado_participacion = 'finalizado',
    fecha_fin_participacion = v_now
  WHERE servicio_id = p_servicio_id
    AND conductor_id = p_conductor_id;

  IF NOT FOUND THEN
    INSERT INTO public.servicio_asignaciones (
      servicio_id,
      conductor_id,
      stop_id,
      tipo_asignacion,
      estado_participacion,
      fecha_fin_participacion
    )
    VALUES (
      p_servicio_id,
      p_conductor_id,
      NULL,
      'colaborador',
      'finalizado',
      v_now
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_participacion_conductor_guarded(uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalizar_participacion_conductor_guarded(uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalizar_participacion_conductor_guarded(uuid, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.finalizar_participacion_conductor_guarded(uuid, uuid, boolean) IS
  'Finaliza participación del conductor validando que ninguna parada pendiente visible quede huérfana.';

-- <<< END supabase/migrations/20260719120000_soltar_parada_guarded_rpc.sql

-- =============================================================================
-- FIN prod-all-migrations-consolidated.sql
-- Verificación rápida:
-- =============================================================================
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'user_can_access_servicio',
    'user_can_insert_servicio',
    'lookup_empresa_por_codigo',
    'get_current_office_user_context',
    'user_can_manage_dcdt_trafico',
    'soltar_parada_conductor_guarded'
  )
ORDER BY 1;
