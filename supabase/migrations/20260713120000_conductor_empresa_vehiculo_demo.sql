-- DEMO: matrícula remolque en flota empresa (autorrelleno DCDT art. 6).
-- matricula ya existe en conductor_empresa; remolque se añade aquí.

ALTER TABLE public.conductor_empresa
  ADD COLUMN IF NOT EXISTS remolque text;

COMMENT ON COLUMN public.conductor_empresa.remolque IS
  'Matrícula remolque/semirremolque asignado al conductor en la flota (DCDT art. 6).';
