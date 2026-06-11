-- =============================================================================
-- DEMO ONLY — alinear estructura con PRODUCCIÓN (idempotente, sin DELETE)
--
-- Proyecto destino: fezacjtbavgdosncxlzw (Supabase DEMO)
-- NO ejecutar en glyexutcypmhkndvmcxd (PRODUCCIÓN)
--
-- Aplica:
--   • 6 tablas agenda comercial (tenant + admin)
--   • Columnas faltantes en profiles, documentacion_envios, servicios
--   • Función is_superadmin_agenda_user + RLS agenda
--   • Trigger profiles.is_archived (si falta)
--
-- No modifica filas existentes salvo:
--   • profiles.is_archived NULL → false (si aplica)
--   • profiles.empresa_status NULL en cuentas empresa → 'approved' (demo operable)
-- =============================================================================

-- ─── 1. profiles.is_archived ───────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_archived IS
  'Si true: oculto en listados operativos; mantiene id y relaciones.';

UPDATE public.profiles SET is_archived = false WHERE is_archived IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_list
  ON public.profiles (updated_at DESC)
  WHERE (is_archived = false);

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

-- ─── 2. profiles.empresa_status ────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS empresa_status text;

COMMENT ON COLUMN public.profiles.empresa_status IS
  'Solo tipo_cuenta=empresa: pending | approved | rejected.';

UPDATE public.profiles
SET empresa_status = 'approved'
WHERE tipo_cuenta = 'empresa'
  AND (empresa_status IS NULL OR empresa_status = '');

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

-- ─── 3. documentacion_envios (mail / provider) ───────────────────────────────
ALTER TABLE public.documentacion_envios
  ADD COLUMN IF NOT EXISTS cc text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS destinatario text,
  ADD COLUMN IF NOT EXISTS remitente_mostrado text,
  ADD COLUMN IF NOT EXISTS reply_to text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

COMMENT ON COLUMN public.documentacion_envios.provider IS 'resend | simulacion';
COMMENT ON COLUMN public.documentacion_envios.provider_message_id IS 'ID mensaje Resend (si aplica)';

-- ─── 4. servicios.responsable_nombre ───────────────────────────────────────
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS responsable_nombre text;

COMMENT ON COLUMN public.servicios.responsable_nombre IS
  'Nombre del responsable de oficina al crear/asignar servicio.';

-- ─── 5. Función super_admin agenda ─────────────────────────────────────────
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

-- ─── 6. agenda_comercial_* (tenant) ────────────────────────────────────────
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
  persona_contacto text,
  acuerdos_compromisos text,
  precio_orientativo text,
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

ALTER TABLE public.agenda_comercial_prospectos
  ADD COLUMN IF NOT EXISTS persona_contacto text,
  ADD COLUMN IF NOT EXISTS acuerdos_compromisos text,
  ADD COLUMN IF NOT EXISTS precio_orientativo text;

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

-- ─── 7. admin_agenda_comercial_* (super_admin) ─────────────────────────────
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
  persona_contacto text,
  acuerdos_compromisos text,
  precio_orientativo text,
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

ALTER TABLE public.admin_agenda_comercial_prospectos
  ADD COLUMN IF NOT EXISTS persona_contacto text,
  ADD COLUMN IF NOT EXISTS acuerdos_compromisos text,
  ADD COLUMN IF NOT EXISTS precio_orientativo text;

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
