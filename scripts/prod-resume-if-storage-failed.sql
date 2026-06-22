-- =============================================================================
-- Si prod-all-migrations-consolidated.sql falló en storage.objects (42501):
--   1. Los bloques 1–2 (hasta rls_servicio_ownership_core) ya aplicaron OK.
--   2. Pega y ejecuta TODO prod-all-migrations-consolidated.sql REGENERADO
--      (usa prod-storage-and-legacy-rls-safe.sql — omite storage sin owner).
--
-- O continúa manualmente desde el bloque 4 en el bundle:
--   >>> FILE: supabase/migrations/20260516120000_profiles_is_archived.sql
--
-- Storage policies (si el safe skip las omitió): Dashboard → Storage → Policies
-- o scripts/prod-fix-user-photos-mime-types.sql para MIME types.
-- =============================================================================

SELECT 'Ejecuta el bundle regenerado o continúa desde profiles_is_archived' AS instruccion;
