-- =============================================================================
-- DEMO ONLY: fix office_user_can_insert_planned_servicio
-- Proyecto fezacjtbavgdosncxlzw — idempotente. NO aplicar en REAL.
--
-- Regla: usuario oficina activo (jefe_flota/tráfico) puede INSERT planificado
-- con conductor_id NULL. Si conductor_id viene informado, debe ser de la flota.
-- No toca user_can_insert_servicio ni policies srv_*.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.office_user_can_insert_planned_servicio(
  p_empresa_id uuid,
  p_conductor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_empresa_id IS NULL THEN
    RETURN false;
  END IF;

  SET LOCAL row_security = off;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND eu.user_id = auth.uid()
      AND eu.activo = true
      AND eu.rol IN ('jefe_flota', 'trafico')
  ) THEN
    RETURN false;
  END IF;

  -- Planificado sin conductor: permitido explícitamente
  IF p_conductor_id IS NULL THEN
    RETURN true;
  END IF;

  -- Conductor opcional al crear: debe pertenecer a la flota de la empresa
  RETURN EXISTS (
    SELECT 1
    FROM public.conductor_empresa ce
    WHERE ce.empresa_id = p_empresa_id
      AND ce.user_id = p_conductor_id
      AND (ce.activo IS DISTINCT FROM false)
  );
END;
$$;

COMMENT ON FUNCTION public.office_user_can_insert_planned_servicio(uuid, uuid) IS
  'DEMO: oficina activa (jefe_flota/tráfico) crea servicio; conductor_id NULL permitido.';

REVOKE ALL ON FUNCTION public.office_user_can_insert_planned_servicio(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_user_can_insert_planned_servicio(uuid, uuid) TO authenticated, service_role;

-- Verificación rápida (auth.uid() será NULL en SQL Editor; probar con RPC + JWT)
SELECT
  p.proname,
  CASE p.provolatile WHEN 'v' THEN 'VOLATILE' ELSE p.provolatile::text END AS volatility,
  position('p_conductor_id IS NULL' in pg_get_functiondef(p.oid)) > 0 AS permite_conductor_null
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'office_user_can_insert_planned_servicio';
