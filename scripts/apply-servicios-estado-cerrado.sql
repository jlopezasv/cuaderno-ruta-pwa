-- =============================================================================
-- Añadir estado documental `cerrado` a public.servicios.estado
--
-- Ejecutar en Supabase → SQL Editor si PATCH devuelve:
--   violates check constraint "servicios_estado_check"
--
-- Idempotente: elimina cualquier CHECK sobre `estado` y recrea el canónico.
-- Equivalente a: supabase/migrations/20260522130000_servicios_estado_cerrado.sql
-- =============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'servicios'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE public.servicios DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.servicios
  ADD CONSTRAINT servicios_estado_check
  CHECK (
    estado IN (
      'pendiente_asignacion',
      'asignado',
      'en_curso',
      'completado',
      'cerrado',
      'anulado',
      'cancelado'
    )
  );

COMMENT ON COLUMN public.servicios.estado IS
  'pendiente_asignacion | asignado | en_curso | completado (operativa) | cerrado (expediente firmado) | anulado | cancelado';

-- Verificación
SELECT
  c.conname,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'servicios'
  AND c.conname = 'servicios_estado_check';
