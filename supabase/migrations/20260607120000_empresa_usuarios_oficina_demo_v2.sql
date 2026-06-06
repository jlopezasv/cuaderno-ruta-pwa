-- =============================================================================
-- DEMO v2: multiusuario oficina — idempotente, reutiliza objetos v1
-- SOLO Supabase DEMO. Aplicado manualmente en SQL Editor.
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

CREATE INDEX IF NOT EXISTS idx_servicios_responsable_user
  ON public.servicios (responsable_user_id)
  WHERE responsable_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_servicios_empresa_id
  ON public.servicios (empresa_id);
CREATE INDEX IF NOT EXISTS idx_servicios_empresa_responsable
  ON public.servicios (empresa_id, responsable_user_id);

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

DROP POLICY IF EXISTS emp_sel_oficina_demo ON public.empresas;

CREATE POLICY emp_sel_oficina_demo ON public.empresas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.empresa_usuarios eu
      WHERE eu.empresa_id = empresas.id
        AND eu.user_id = auth.uid()
        AND eu.activo = true
    )
  );
