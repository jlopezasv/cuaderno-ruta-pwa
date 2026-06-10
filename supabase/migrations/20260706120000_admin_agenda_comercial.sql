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
