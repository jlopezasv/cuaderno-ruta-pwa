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
