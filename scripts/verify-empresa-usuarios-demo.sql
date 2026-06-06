-- Verificación post-migración empresa_usuarios (SOLO DEMO)
-- Ejecutar en SQL Editor del proyecto Supabase DEMO.

-- 1) Tabla existe
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'empresa_usuarios'
) AS tabla_empresa_usuarios_existe;

-- 2) Columna responsable_user_id en servicios
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'servicios'
    AND column_name = 'responsable_user_id'
) AS columna_responsable_user_id_existe;

-- 3) Cada owner aparece como jefe_flota
SELECT
  e.id AS empresa_id,
  e.nombre AS empresa_nombre,
  e.owner_id,
  eu.rol,
  eu.activo,
  eu.puede_ver_todos,
  CASE
    WHEN eu.id IS NULL THEN 'FALTA owner en empresa_usuarios'
    WHEN eu.rol <> 'jefe_flota' THEN 'FALTA rol jefe_flota'
    WHEN eu.activo IS NOT TRUE THEN 'FALTA activo'
    ELSE 'OK'
  END AS estado
FROM public.empresas e
LEFT JOIN public.empresa_usuarios eu
  ON eu.empresa_id = e.id AND eu.user_id = e.owner_id
ORDER BY e.created_at;

-- 4) Resumen: owners sin jefe_flota
SELECT COUNT(*) AS owners_sin_jefe_flota
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = e.id
    AND eu.user_id = e.owner_id
    AND eu.rol = 'jefe_flota'
    AND eu.activo = true
);

-- 5) Confirmar proyecto (ref en URL del dashboard; no debe ser glyexutcypmhkndvmcxd)
SELECT current_database() AS db_name;
