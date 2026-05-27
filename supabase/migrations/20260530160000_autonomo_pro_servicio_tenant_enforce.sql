-- Autónomo PRO: al crear servicio propio (conductor_id = auth.uid), forzar empresa_id NULL.
-- Evita herencia accidental desde cliente o defaults aunque exista conductor_empresa activo.

CREATE OR REPLACE FUNCTION public.servicios_enforce_autonomo_pro_own_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND public.user_profile_is_autonomo_pro()
     AND NEW.conductor_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NEW.conductor_id = auth.uid()
  THEN
    NEW.empresa_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.servicios_enforce_autonomo_pro_own_tenant() IS
  'BEFORE INSERT: autonomo_pro creando servicio propio → empresa_id siempre NULL (sin tenant flota).';

DROP TRIGGER IF EXISTS servicios_bi_autonomo_pro_own_tenant ON public.servicios;

CREATE TRIGGER servicios_bi_autonomo_pro_own_tenant
  BEFORE INSERT ON public.servicios
  FOR EACH ROW
  EXECUTE FUNCTION public.servicios_enforce_autonomo_pro_own_tenant();

REVOKE ALL ON FUNCTION public.servicios_enforce_autonomo_pro_own_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.servicios_enforce_autonomo_pro_own_tenant() TO authenticated, service_role;
