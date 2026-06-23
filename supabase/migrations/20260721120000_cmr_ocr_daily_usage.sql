-- Cuota diaria de OCR CMR por usuario (entorno DEMO).
-- La API /api/cmr consume vía try_consume_cmr_ocr_quota() con service role.

CREATE TABLE IF NOT EXISTS public.cmr_ocr_daily_usage (
  user_id uuid NOT NULL,
  usage_date date NOT NULL DEFAULT ((timezone('utc', now()))::date),
  ocr_count integer NOT NULL DEFAULT 0 CHECK (ocr_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

COMMENT ON TABLE public.cmr_ocr_daily_usage IS
  'Contador diario (UTC) de llamadas OCR CMR por usuario. Usado por /api/cmr en demo (límite inicial: 10/día).';

CREATE INDEX IF NOT EXISTS cmr_ocr_daily_usage_date_idx
  ON public.cmr_ocr_daily_usage (usage_date);

CREATE OR REPLACE FUNCTION public.cmr_ocr_daily_usage_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cmr_ocr_daily_usage_updated_at_trg ON public.cmr_ocr_daily_usage;
CREATE TRIGGER cmr_ocr_daily_usage_updated_at_trg
  BEFORE UPDATE ON public.cmr_ocr_daily_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.cmr_ocr_daily_usage_set_updated_at();

ALTER TABLE public.cmr_ocr_daily_usage ENABLE ROW LEVEL SECURITY;

-- Solo service role / SECURITY DEFINER; sin políticas para anon/authenticated.

CREATE OR REPLACE FUNCTION public.try_consume_cmr_ocr_quota(
  p_user_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date := (timezone('utc', now()))::date;
  v_count integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_required');
  END IF;

  SELECT ocr_count INTO v_count
  FROM public.cmr_ocr_daily_usage
  WHERE user_id = p_user_id AND usage_date = v_date
  FOR UPDATE;

  IF NOT FOUND THEN
    v_count := 0;
  END IF;

  IF v_count >= p_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'limit', p_limit,
      'count', v_count,
      'usage_date', v_date::text
    );
  END IF;

  INSERT INTO public.cmr_ocr_daily_usage (user_id, usage_date, ocr_count)
  VALUES (p_user_id, v_date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET
    ocr_count = public.cmr_ocr_daily_usage.ocr_count + 1,
    updated_at = now()
  RETURNING ocr_count INTO v_count;

  RETURN jsonb_build_object(
    'ok', true,
    'limit', p_limit,
    'count', v_count,
    'usage_date', v_date::text
  );
END;
$$;

COMMENT ON FUNCTION public.try_consume_cmr_ocr_quota(uuid, integer) IS
  'Incrementa contador OCR CMR del día (UTC) si no se superó p_limit. Llamar solo desde API con service role.';
