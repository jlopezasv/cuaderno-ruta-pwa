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
