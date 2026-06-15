-- DEMO: DeCA — identificador público estable por dcdt_servicio
-- Proyecto: cuaderno-demo-ab.vercel.app · Supabase fezacjtbavgdosncxlzw
-- Ejecutar solo en DEMO:
--   node scripts/apply-sql-file.mjs supabase/migrations/20260712120000_dcdt_deca_public_id_demo.sql
--
-- Semántica deca_public_id:
--   - Estable por fila dcdt_servicio; regeneración PDF in-place mantiene el mismo id → misma URL/QR.
--   - Nuevo uuid solo al emitir documento nuevo (futuro: nueva pdf_dcdt_version / nuevo QR).

ALTER TABLE public.dcdt_servicio
  ADD COLUMN IF NOT EXISTS deca_public_id uuid;

UPDATE public.dcdt_servicio
SET deca_public_id = gen_random_uuid()
WHERE deca_public_id IS NULL;

ALTER TABLE public.dcdt_servicio
  ALTER COLUMN deca_public_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN deca_public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dcdt_servicio_deca_public_id
  ON public.dcdt_servicio (deca_public_id);

COMMENT ON COLUMN public.dcdt_servicio.deca_public_id IS
  'UUID público estable (DeCA). URL canónica: /api/dcdt-download?id={deca_public_id}. '
  'Se conserva al regenerar PDF in-place; nuevo uuid solo en emisión de documento nuevo.';
