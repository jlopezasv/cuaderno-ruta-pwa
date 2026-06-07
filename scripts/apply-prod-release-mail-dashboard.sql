-- =============================================================================
-- Release producción REAL (glyexutcypmhkndvmcxd) — SQL Editor
-- 1) Columnas mail  2) Legacy stops/evidencias solo si existen
-- =============================================================================

-- ─── 1) Mail cliente ───
ALTER TABLE public.documentacion_envios
  ADD COLUMN IF NOT EXISTS cc text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

COMMENT ON COLUMN public.documentacion_envios.cc IS 'Copia (CC) del envío al cliente';
COMMENT ON COLUMN public.documentacion_envios.sent_at IS 'Marca de tiempo del envío efectivo';

ALTER TABLE public.documentacion_envios
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

-- ─── 2) Comprobar legacy ───
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('stops', 'evidencias')
  AND policyname IN ('stops_acceso', 'evidencias_acceso');

-- Si la query anterior devuelve filas, ejecutar a continuación los archivos completos:
--   supabase/migrations/20260530180000_multi_conductor_stops_rls_repair.sql
--   supabase/migrations/20260530190000_multi_conductor_evidencias_rls_repair.sql
