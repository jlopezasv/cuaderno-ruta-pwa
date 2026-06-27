-- Autónomo PRO: RPC seguro para crear expediente/servicio propio (bypass RLS INSERT).
-- Idempotente. Aplicar en DEMO y PROD si POST /servicios devuelve 42501.

CREATE OR REPLACE FUNCTION public.create_autonomo_expediente_servicio(
  p_referencia text DEFAULT NULL,
  p_fecha_inicio timestamptz DEFAULT NULL,
  p_estado text DEFAULT 'en_curso'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_row public.servicios;
  v_estado text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_profile_is_autonomo_pro() THEN
    RAISE EXCEPTION
      'Solo cuentas autonomo_pro pueden crear expedientes propios. Revisa profiles.tipo_cuenta.'
      USING ERRCODE = '42501';
  END IF;

  v_estado := lower(trim(COALESCE(p_estado, 'en_curso')));
  IF v_estado NOT IN ('asignado', 'en_curso') THEN
    v_estado := 'en_curso';
  END IF;

  INSERT INTO public.servicios (
    empresa_id,
    conductor_id,
    estado,
    origen,
    destino,
    referencia,
    fecha_inicio
  ) VALUES (
    NULL,
    v_uid,
    v_estado,
    '',
    '',
    p_referencia,
    COALESCE(p_fecha_inicio, now())
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION public.create_autonomo_expediente_servicio(text, timestamptz, text) IS
  'Autónomo PRO: crea servicio propio (empresa_id NULL) para expediente operacional.';

REVOKE ALL ON FUNCTION public.create_autonomo_expediente_servicio(text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_autonomo_expediente_servicio(text, timestamptz, text) TO authenticated, service_role;

-- Refuerzo: user_profile_is_autonomo_pro VOLATILE (lee profiles con row_security off)
CREATE OR REPLACE FUNCTION public.user_profile_is_autonomo_pro()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT pr.tipo_cuenta
  INTO v_tipo
  FROM public.profiles pr
  WHERE pr.id = auth.uid()
  LIMIT 1;
  RETURN COALESCE(v_tipo IN ('autonomo_pro', 'autonomo'), false);
END;
$$;

REVOKE ALL ON FUNCTION public.user_profile_is_autonomo_pro() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_profile_is_autonomo_pro() TO authenticated, service_role;
