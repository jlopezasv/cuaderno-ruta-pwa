-- =============================================================================
-- DEMO ← REAL: alineación esquema (generado desde supabase/migrations)
-- Seguro para datos existentes: sin DELETE, TRUNCATE ni DROP TABLE.
-- Regenerar: node scripts/build-demo-align-incremental.mjs
--
-- Orden (17 migraciones):
--   20260513120000_servicio_extra_docs_mail.sql
--   20260514120000_rls_servicio_ownership_core.sql
--   20260515190000_storage_and_legacy_rls.sql
--   20260516120000_profiles_is_archived.sql
--   20260517130000_ubicaciones_operativa_columns.sql
--   20260518120000_servicios_empresa_id_optional.sql
--   20260518140000_empresas_codigo_equipo.sql
--   20260518160000_revoke_anon_table_grants.sql
--   20260518200000_ubicaciones_select_empresa_flota.sql
--   20260519120000_evidencias_doc_meta.sql
--   20260519120000_servicio_documentos_extra_schema_align.sql
--   20260520130000_extra_docs_empresa_select.sql
--   20260521120000_servicio_sin_conductor_y_asignaciones.sql
--   20260521140000_servicios_rls_pendiente_asignacion.sql
--   20260521150000_servicios_rls_sin_conductor_definitivo.sql
--   20260521160000_servicios_estado_pendiente_asignacion.sql
--   20260523120000_repair_servicios_rls_functions.sql
-- =============================================================================


-- >>> 20260513120000_servicio_extra_docs_mail.sql

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


-- >>> 20260514120000_rls_servicio_ownership_core.sql

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


-- >>> 20260515190000_storage_and_legacy_rls.sql

-- =============================================================================
-- Storage (user-photos, cmr) + tablas legacy con ownership user_id.
-- Prerrequisito: public.user_can_access_servicio (migración 20260514120000…).
-- Verificar en Dashboard que existan buckets "user-photos" y "cmr".
-- =============================================================================

UPDATE storage.buckets
SET public = false
WHERE name IN ('user-photos', 'cmr')
   OR id::text IN ('user-photos', 'cmr');

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- user-photos
DROP POLICY IF EXISTS "stor_uph_sel_own" ON storage.objects;
DROP POLICY IF EXISTS "stor_uph_sel_fleet" ON storage.objects;
DROP POLICY IF EXISTS "stor_uph_ins" ON storage.objects;
DROP POLICY IF EXISTS "stor_uph_upd" ON storage.objects;
DROP POLICY IF EXISTS "stor_uph_del" ON storage.objects;

CREATE POLICY "stor_uph_sel_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

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
  );

CREATE POLICY "stor_uph_ins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "stor_uph_upd" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "stor_uph_del" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'user-photos')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- cmr
DROP POLICY IF EXISTS "stor_cmr_sel_own" ON storage.objects;
DROP POLICY IF EXISTS "stor_cmr_sel_fleet" ON storage.objects;
DROP POLICY IF EXISTS "stor_cmr_ins" ON storage.objects;
DROP POLICY IF EXISTS "stor_cmr_upd" ON storage.objects;
DROP POLICY IF EXISTS "stor_cmr_del" ON storage.objects;

CREATE POLICY "stor_cmr_sel_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

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
  );

CREATE POLICY "stor_cmr_ins" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "stor_cmr_upd" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "stor_cmr_del" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'cmr')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Legacy: solo si existe columna user_id (ajustar migración manual si el esquema difiere)
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


-- >>> 20260516120000_profiles_is_archived.sql

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


-- >>> 20260517130000_ubicaciones_operativa_columns.sql

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


-- >>> 20260518120000_servicios_empresa_id_optional.sql

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


-- >>> 20260518140000_empresas_codigo_equipo.sql

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


-- >>> 20260518160000_revoke_anon_table_grants.sql

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


-- >>> 20260518200000_ubicaciones_select_empresa_flota.sql

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


-- >>> 20260519120000_evidencias_doc_meta.sql

-- Metadatos documentales operativos en evidencias.datos.doc_meta (JSON, sin romper filas existentes).
-- Campos opcionales futuros: columnas dedicadas si hace falta indexar OCR/clasificación.

COMMENT ON COLUMN public.evidencias.datos IS
  'JSON: campos CMR + doc_meta { display_name, size_bytes, preview_url, original_url, mime_type, future_hooks { qr_muelle, check_in_carga, ... } }';


-- >>> 20260519120000_servicio_documentos_extra_schema_align.sql

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


-- >>> 20260520130000_extra_docs_empresa_select.sql

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


-- >>> 20260521120000_servicio_sin_conductor_y_asignaciones.sql

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


-- >>> 20260521140000_servicios_rls_pendiente_asignacion.sql

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


-- >>> 20260521150000_servicios_rls_sin_conductor_definitivo.sql

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


-- >>> 20260521160000_servicios_estado_pendiente_asignacion.sql

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


-- >>> 20260523120000_repair_servicios_rls_functions.sql

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

