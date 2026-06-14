-- DEMO / prod-safe: domicilio fiscal transportista en empresas (DCDT)
-- Sincronizable desde perfil de empresa; fallback sigue siendo profiles del owner.

DO $$
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RAISE NOTICE 'empresas: omitido domicilio DCDT';
    RETURN;
  END IF;

  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS direccion text;
  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cp text;
  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS ciudad text;
  ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS domicilio_fiscal text;

  COMMENT ON COLUMN public.empresas.direccion IS 'Dirección / domicilio fiscal (DCDT transportista)';
  COMMENT ON COLUMN public.empresas.domicilio_fiscal IS 'Alias domicilio fiscal si difiere de direccion';
END $$;
