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
