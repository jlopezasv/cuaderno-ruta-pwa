-- Campos comerciales en prospectos (admin + tenant legacy).

ALTER TABLE public.admin_agenda_comercial_prospectos
  ADD COLUMN IF NOT EXISTS persona_contacto text,
  ADD COLUMN IF NOT EXISTS acuerdos_compromisos text,
  ADD COLUMN IF NOT EXISTS precio_orientativo text;

ALTER TABLE public.agenda_comercial_prospectos
  ADD COLUMN IF NOT EXISTS persona_contacto text,
  ADD COLUMN IF NOT EXISTS acuerdos_compromisos text,
  ADD COLUMN IF NOT EXISTS precio_orientativo text;
