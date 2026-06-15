-- DEMO: chat interno tipo bloc de notas por servicio (service_messages).
-- Aplicar SOLO en Supabase DEMO. No ejecutar en producción hasta UAT.

CREATE TABLE IF NOT EXISTS public.service_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  sender_name text,
  sender_role text,
  message text NOT NULL,
  visibility text NOT NULL DEFAULT 'internal',
  include_in_customer_report boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_messages_message_min_len CHECK (char_length(trim(message)) >= 1),
  CONSTRAINT service_messages_visibility_check CHECK (visibility IN ('internal'))
);

COMMENT ON TABLE public.service_messages IS
  'Mensajes internos por servicio (bloc de notas). No chat general.';

CREATE INDEX IF NOT EXISTS service_messages_servicio_created_idx
  ON public.service_messages (servicio_id, created_at ASC);

CREATE INDEX IF NOT EXISTS service_messages_empresa_created_idx
  ON public.service_messages (empresa_id, created_at DESC)
  WHERE empresa_id IS NOT NULL;

-- Coherencia empresa_id / conductor no marca expediente cliente
CREATE OR REPLACE FUNCTION public.service_messages_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  svc_empresa uuid;
  svc_conductor uuid;
BEGIN
  SELECT s.empresa_id, s.conductor_id
    INTO svc_empresa, svc_conductor
  FROM public.servicios s
  WHERE s.id = NEW.servicio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'servicio_id inválido';
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM svc_empresa THEN
    NEW.empresa_id := svc_empresa;
  END IF;

  IF NEW.sender_role = 'conductor'
     OR NEW.sender_user_id = svc_conductor THEN
    NEW.include_in_customer_report := false;
  END IF;

  NEW.visibility := 'internal';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_messages_before_write_trg ON public.service_messages;
CREATE TRIGGER service_messages_before_write_trg
  BEFORE INSERT OR UPDATE ON public.service_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.service_messages_before_write();

ALTER TABLE public.service_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.service_messages TO authenticated;
GRANT ALL ON public.service_messages TO service_role;

DROP POLICY IF EXISTS "sm_sel" ON public.service_messages;
CREATE POLICY "sm_sel" ON public.service_messages
  FOR SELECT TO authenticated
  USING (public.user_can_access_servicio(servicio_id));

DROP POLICY IF EXISTS "sm_ins" ON public.service_messages;
CREATE POLICY "sm_ins" ON public.service_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_servicio(servicio_id)
    AND sender_user_id = auth.uid()
    AND char_length(trim(message)) >= 1
  );

-- Sin UPDATE/DELETE: bloc de notas append-only

SELECT 'service_messages demo OK' AS status,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'service_messages') AS table_exists;
