-- =============================================================================
-- FASE 0 — Inventario SOLO LECTURA (Supabase REAL glyexutcypmhkndvmcxd)
-- Ejecutar en SQL Editor. No modifica datos.
-- =============================================================================

-- 1) Funciones prerrequisito
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'user_is_active_office_peer',
    'user_can_manage_dcdt_trafico',
    'user_can_access_servicio',
    'is_superadmin_agenda_user'
  )
ORDER BY 1;

-- 2) Tablas DeCA / soporte
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'dcdt_servicio',
    'master_partes_transporte',
    'service_messages',
    'retention_asset_catalog',
    'empresa_usuarios'
  )
ORDER BY 1;

-- 3) Extra útil antes de Fase 1
SELECT COUNT(*) AS filas_dcdt FROM public.dcdt_servicio;
-- Si la tabla no existe, este SELECT fallará (esperado).
