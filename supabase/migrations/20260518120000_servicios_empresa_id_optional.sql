-- Modo autónomo: servicios pueden existir solo con conductor_id (empresa_id NULL).
-- Idempotente: solo altera si la columna existe y aún es NOT NULL.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'servicios'
      AND column_name = 'empresa_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.servicios ALTER COLUMN empresa_id DROP NOT NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.servicios.empresa_id IS
  'Propiedad secundaria opcional (flota). NULL = servicio del conductor sin empresa vinculada al registro.';
