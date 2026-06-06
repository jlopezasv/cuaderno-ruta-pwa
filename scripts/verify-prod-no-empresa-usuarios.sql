-- Verificación PRODUCCIÓN: no debe existir tabla empresa_usuarios ni columna responsable_user_id
-- Ejecutar SOLO en proyecto Supabase REAL para confirmar que no se aplicó la migración demo.

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'empresa_usuarios'
) AS prod_tiene_empresa_usuarios;

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'servicios'
    AND column_name = 'responsable_user_id'
) AS prod_tiene_responsable_user_id;

-- Esperado en producción (sin migración): ambos FALSE
