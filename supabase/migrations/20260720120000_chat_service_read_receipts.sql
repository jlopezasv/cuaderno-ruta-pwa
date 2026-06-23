-- Lectura de chat por usuario y servicio (recibos independientes por auth.uid()).

CREATE TABLE IF NOT EXISTS public.chat_service_read_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  last_read_message_id uuid REFERENCES public.service_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_service_read_receipts_servicio_user_key UNIQUE (servicio_id, user_id)
);

COMMENT ON TABLE public.chat_service_read_receipts IS
  'Última lectura del chat interno por usuario y servicio; cada usuario tiene su propio recibo.';

CREATE INDEX IF NOT EXISTS chat_service_read_receipts_servicio_idx
  ON public.chat_service_read_receipts (servicio_id);

CREATE INDEX IF NOT EXISTS chat_service_read_receipts_user_idx
  ON public.chat_service_read_receipts (user_id);

CREATE OR REPLACE FUNCTION public.chat_service_read_receipts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_service_read_receipts_updated_at_trg ON public.chat_service_read_receipts;
CREATE TRIGGER chat_service_read_receipts_updated_at_trg
  BEFORE UPDATE ON public.chat_service_read_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_service_read_receipts_set_updated_at();

ALTER TABLE public.chat_service_read_receipts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.chat_service_read_receipts TO authenticated;
GRANT ALL ON public.chat_service_read_receipts TO service_role;

DROP POLICY IF EXISTS "csrr_sel" ON public.chat_service_read_receipts;
CREATE POLICY "csrr_sel" ON public.chat_service_read_receipts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.user_can_access_servicio(servicio_id)
  );

DROP POLICY IF EXISTS "csrr_ins" ON public.chat_service_read_receipts;
CREATE POLICY "csrr_ins" ON public.chat_service_read_receipts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_can_access_servicio(servicio_id)
  );

DROP POLICY IF EXISTS "csrr_upd" ON public.chat_service_read_receipts;
CREATE POLICY "csrr_upd" ON public.chat_service_read_receipts
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.user_can_access_servicio(servicio_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_can_access_servicio(servicio_id)
  );

SELECT 'chat_service_read_receipts OK' AS status,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'chat_service_read_receipts') AS table_exists;
