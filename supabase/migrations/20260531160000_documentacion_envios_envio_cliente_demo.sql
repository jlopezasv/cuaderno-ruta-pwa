-- Demo: campos extra para envío revisable de expediente al cliente (documentacion_envios).
-- Idempotente. No requiere cambios en producción hasta activar la feature.

ALTER TABLE public.documentacion_envios
  ADD COLUMN IF NOT EXISTS cc text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

COMMENT ON COLUMN public.documentacion_envios.cc IS 'Copia (CC) del envío al cliente';
COMMENT ON COLUMN public.documentacion_envios.sent_at IS 'Marca de tiempo del envío efectivo (o simulado en demo)';
