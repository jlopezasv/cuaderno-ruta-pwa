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
