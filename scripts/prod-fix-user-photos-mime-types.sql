-- =============================================================================
-- PROD REAL (glyexutcypmhkndvmcxd) — bucket user-photos y DeCA (PDF + QR PNG)
-- Ejecutar en SQL Editor. Corrige 400 al subir application/pdf o image/png.
-- =============================================================================

-- 1) Estado actual
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE name = 'user-photos';

-- 2) Permitir PDF + imágenes (NULL = sin restricción, alineado con demo-storage-buckets.sql)
UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE name = 'user-photos';

-- Alternativa explícita si prefieres whitelist:
-- UPDATE storage.buckets
-- SET allowed_mime_types = ARRAY[
--   'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
--   'application/pdf'
-- ]::text[]
-- WHERE name = 'user-photos';

-- 3) Verificar
SELECT name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE name = 'user-photos';
