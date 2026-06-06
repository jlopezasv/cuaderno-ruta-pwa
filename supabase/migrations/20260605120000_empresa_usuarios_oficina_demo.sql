-- =============================================================================
-- DEMO: usuarios de oficina + columna responsable_user_id en servicios
-- Aplicar SOLO en proyecto Supabase DEMO.
-- Sin RLS avanzada por responsable_user_id en servicios (fase posterior).
-- =============================================================================

-- ─── 1) Tabla usuarios oficina ────────────────────────────────────────────────
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

-- ─── 2) Índices y comentarios ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_empresa_activo
  ON public.empresa_usuarios (empresa_id)
  WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_user_activo
  ON public.empresa_usuarios (user_id)
  WHERE activo = true;

COMMENT ON TABLE public.empresa_usuarios IS
  'Usuarios de oficina por empresa (jefe_flota, trafico, administrativo). DEMO.';

COMMENT ON COLUMN public.empresa_usuarios.email IS
  'Copia desnormalizada del email de login (auth.users). No usar profiles.email_empresa.';

-- ─── 3) Responsable operativo en servicios (columna only, sin RLS nueva) ──────
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS responsable_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_servicios_responsable_user
  ON public.servicios (responsable_user_id)
  WHERE responsable_user_id IS NOT NULL;

COMMENT ON COLUMN public.servicios.responsable_user_id IS
  'Usuario oficina responsable. NULL = legacy. RLS por responsable: fase posterior. DEMO.';

-- ─── 4) Helper: ¿puede gestionar usuarios de oficina de esta empresa? ─────────
-- Solo owner de la empresa o jefe_flota activo de la misma empresa.
CREATE OR REPLACE FUNCTION public.user_can_manage_empresa_usuarios(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p_empresa_id IS NOT NULL
    AND (
      EXISTS (
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
          AND eu.rol = 'jefe_flota'
      )
    );
$$;

COMMENT ON FUNCTION public.user_can_manage_empresa_usuarios(uuid) IS
  'DEMO: true si auth.uid() es owner_id de la empresa o jefe_flota activo de la misma.';

-- ─── 5) Seed: owner → jefe_flota (idempotente) ────────────────────────────────
-- Email desde auth.users; si no hay fila o email, NULL.
INSERT INTO public.empresa_usuarios (
  empresa_id, user_id, nombre, email, rol, puede_ver_todos, activo
)
SELECT
  e.id,
  e.owner_id,
  p.nombre,
  NULLIF(BTRIM(u.email), ''),
  'jefe_flota',
  true,
  true
FROM public.empresas e
JOIN public.profiles p ON p.id = e.owner_id
LEFT JOIN auth.users u ON u.id = e.owner_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = e.id
    AND eu.user_id = e.owner_id
);

-- ─── 6) RLS, grants y policies ────────────────────────────────────────────────
ALTER TABLE public.empresa_usuarios ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.empresa_usuarios TO authenticated;
GRANT ALL ON public.empresa_usuarios TO service_role;

DROP POLICY IF EXISTS eu_sel ON public.empresa_usuarios;
DROP POLICY IF EXISTS eu_ins ON public.empresa_usuarios;
DROP POLICY IF EXISTS eu_upd ON public.empresa_usuarios;

-- SELECT: gestores (owner / jefe_flota) de la empresa + cada usuario su propia fila
CREATE POLICY eu_sel ON public.empresa_usuarios
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_can_manage_empresa_usuarios(empresa_id)
  );

-- INSERT: solo owner o jefe_flota activo de ESA empresa
CREATE POLICY eu_ins ON public.empresa_usuarios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_manage_empresa_usuarios(empresa_id)
  );

-- UPDATE: solo owner o jefe_flota activo de ESA empresa
CREATE POLICY eu_upd ON public.empresa_usuarios
  FOR UPDATE TO authenticated
  USING (
    public.user_can_manage_empresa_usuarios(empresa_id)
  )
  WITH CHECK (
    public.user_can_manage_empresa_usuarios(empresa_id)
  );

-- Sin política DELETE → nadie borra vía cliente autenticado (solo service_role).

-- RLS mínima: usuario oficina puede leer su empresa
-- No modifica políticas existentes de servicios.
DROP POLICY IF EXISTS emp_sel_oficina_demo ON public.empresas;

CREATE POLICY emp_sel_oficina_demo ON public.empresas
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT eu.empresa_id
      FROM public.empresa_usuarios eu
      WHERE eu.user_id = auth.uid()
        AND eu.activo = true
    )
  );
