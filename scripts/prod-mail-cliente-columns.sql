-- PRODUCCIÓN: columnas mail cliente en documentacion_envios
-- Equivalente idempotente a 20260531160000 + 20260531170000 (versiones demo del repo).

ALTER TABLE public.documentacion_envios
  ADD COLUMN IF NOT EXISTS cc text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS destinatario text,
  ADD COLUMN IF NOT EXISTS remitente_mostrado text,
  ADD COLUMN IF NOT EXISTS reply_to text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

COMMENT ON COLUMN public.documentacion_envios.cc IS 'Copia (CC) del envío al cliente';
COMMENT ON COLUMN public.documentacion_envios.sent_at IS 'Marca de tiempo del envío efectivo';
COMMENT ON COLUMN public.documentacion_envios.destinatario IS 'Email principal (Para)';
COMMENT ON COLUMN public.documentacion_envios.remitente_mostrado IS 'From mostrado al cliente';
COMMENT ON COLUMN public.documentacion_envios.reply_to IS 'Reply-To (email ficha empresa)';
COMMENT ON COLUMN public.documentacion_envios.provider IS 'resend | simulacion';
COMMENT ON COLUMN public.documentacion_envios.provider_message_id IS 'ID mensaje Resend (si aplica)';
