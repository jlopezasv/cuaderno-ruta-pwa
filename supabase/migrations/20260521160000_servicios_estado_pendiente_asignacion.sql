-- Permitir estado operacional pendiente_asignacion (servicio sin chófer en empresa).
-- Si existe CHECK antiguo solo con asignado|en_curso|completado, el INSERT devolvía 400.

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

COMMENT ON COLUMN public.servicios.estado IS
  'asignado | en_curso | completado | anulado | pendiente_asignacion (sin conductor aún)';
