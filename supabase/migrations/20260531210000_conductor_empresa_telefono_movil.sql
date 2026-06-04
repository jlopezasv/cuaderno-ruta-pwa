-- Teléfono móvil principal del conductor (gestión flota / torre de control).
ALTER TABLE public.conductor_empresa
  ADD COLUMN IF NOT EXISTS telefono_movil text;

COMMENT ON COLUMN public.conductor_empresa.telefono_movil IS
  'Teléfono móvil principal del conductor para contacto operativo (jefe de tráfico).';
