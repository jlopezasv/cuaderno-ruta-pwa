-- DEMO: nombre del responsable de oficina en servicios (multiusuario fase 1).
-- Solo proyecto DEMO (fezacjtbavgdosncxlzw). No aplicar en REAL.

ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS responsable_nombre text;

COMMENT ON COLUMN public.servicios.responsable_nombre IS
  'Nombre del responsable de oficina al crear/asignar servicio (DEMO multiusuario).';
