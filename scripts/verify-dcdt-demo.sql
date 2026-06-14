\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dcdt_servicio'
  ) THEN
    RAISE EXCEPTION 'Falta tabla dcdt_servicio';
  END IF;
END $$;

SELECT 'dcdt_demo_ok' AS status,
       (SELECT count(*) FROM public.master_partes_transporte) AS partes_count,
       (SELECT count(*) FROM public.dcdt_servicio) AS dcdt_count;
