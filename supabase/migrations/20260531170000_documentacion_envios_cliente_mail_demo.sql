-- Demo: auditoría envío expediente al cliente (remitente, reply-to, destinatario).
-- Idempotente. Tabla base: 20260513120000_servicio_extra_docs_mail.sql

ALTER TABLE public.documentacion_envios
  ADD COLUMN IF NOT EXISTS cc text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS destinatario text,
  ADD COLUMN IF NOT EXISTS remitente_mostrado text,
  ADD COLUMN IF NOT EXISTS reply_to text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

COMMENT ON COLUMN public.documentacion_envios.destinatario IS 'Email principal (Para)';
COMMENT ON COLUMN public.documentacion_envios.remitente_mostrado IS 'From mostrado al cliente';
COMMENT ON COLUMN public.documentacion_envios.reply_to IS 'Reply-To (email ficha empresa)';
COMMENT ON COLUMN public.documentacion_envios.provider IS 'resend | simulacion';
COMMENT ON COLUMN public.documentacion_envios.provider_message_id IS 'ID mensaje Resend (si aplica)';
