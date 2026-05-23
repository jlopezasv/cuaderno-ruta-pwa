-- =============================================================================
-- DEMO — buckets Storage (proyecto Supabase DEMO únicamente)
-- Ejecutar en SQL Editor del proyecto DEMO, después de migraciones.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('user-photos', 'user-photos', false, 52428800, NULL),
  ('cmr', 'cmr', false, 52428800, NULL),
  ('expediente_firma', 'expediente_firma', false, 10485760, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  name = EXCLUDED.name;

-- Políticas RLS: aplicar migración 20260515190000_storage_and_legacy_rls.sql
-- (o scripts/demo-safe-align.sql en proyectos con ownership limitado).
