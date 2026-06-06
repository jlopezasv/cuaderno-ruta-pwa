-- =============================================================================
-- AUDITORÍA READ-ONLY — restos multiusuario oficina
-- Ejecutar SOLO en Supabase DEMO → SQL Editor.
-- Solo SELECT. Sin CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, CASCADE.
--
-- INSTRUCCIONES:
--   1) Ejecuta TODO el "BLOQUE A" (siempre seguro).
--   2) Mira SECCIÓN 10 (veredicto). Si empresa_usuarios EXISTE,
--      ejecuta también el "BLOQUE B" (detalle de datos).
-- =============================================================================


-- #############################################################################
-- BLOQUE A — SIEMPRE SEGURO (aunque empresa_usuarios no exista)
-- #############################################################################


-- =============================================================================
-- SECCIÓN 1: OBJETOS EXISTENTES (tablas)
-- =============================================================================
SELECT
  'SECCION_1_OBJETOS' AS seccion,
  expected.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'EXISTE' ELSE 'NO_EXISTE' END AS estado,
  COALESCE((
    SELECT count(*)::int
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = expected.table_name
  ), 0) AS num_columnas
FROM (
  VALUES
    ('empresa_usuarios'),
    ('usuarios_empresa'),
    ('empresas'),
    ('profiles'),
    ('servicios'),
    ('conductor_empresa'),
    ('servicio_documentos_extra'),
    ('push_schedule')
) AS expected(table_name)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
 AND t.table_name = expected.table_name
 AND t.table_type = 'BASE TABLE'
ORDER BY expected.table_name;


-- =============================================================================
-- SECCIÓN 2: COLUMNAS
-- =============================================================================
SELECT
  'SECCION_2_COLUMNAS' AS seccion,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (
    (c.table_name = 'servicios' AND c.column_name = 'responsable_user_id')
    OR (
      c.table_name = 'empresa_usuarios'
      AND c.column_name IN (
        'id', 'empresa_id', 'user_id', 'nombre', 'email', 'rol',
        'puede_ver_todos', 'activo', 'created_at'
      )
    )
    OR (
      c.table_name IN ('profiles', 'empresas', 'usuarios_empresa')
      AND c.column_name IN ('rol', 'puede_ver_todos', 'responsable_user_id')
    )
  )
ORDER BY c.table_name, c.ordinal_position;

SELECT
  'SECCION_2_RESPONSABLE' AS seccion,
  'servicios.responsable_user_id' AS columna,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'servicios'
        AND column_name = 'responsable_user_id'
    ) THEN 'EXISTE'
    ELSE 'NO_EXISTE'
  END AS estado;


-- =============================================================================
-- SECCIÓN 3: ÍNDICES
-- =============================================================================
SELECT
  'SECCION_3_INDICES' AS seccion,
  i.schemaname,
  i.tablename,
  i.indexname,
  i.indexdef
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND (
    i.tablename IN ('empresa_usuarios', 'servicios', 'usuarios_empresa')
    OR i.indexname ILIKE '%empresa_usuarios%'
    OR i.indexname ILIKE '%responsable%'
    OR (
      i.tablename = 'servicios'
      AND (
        i.indexdef ILIKE '%(empresa_id%'
        OR i.indexdef ILIKE '%responsable_user_id%'
      )
    )
  )
ORDER BY i.tablename, i.indexname;


-- =============================================================================
-- SECCIÓN 4: FUNCIONES
-- =============================================================================
SELECT
  'SECCION_4_FUNCIONES' AS seccion,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS argumentos,
  CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  CASE
    WHEN p.provolatile = 'i' THEN 'IMMUTABLE'
    WHEN p.provolatile = 's' THEN 'STABLE'
    ELSE 'VOLATILE'
  END AS volatility
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_current_office_user_context',
    'user_can_manage_empresa_usuarios',
    'es_jefe_de',
    'user_can_access_empresa',
    'user_can_access_servicio'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

SELECT
  'SECCION_4_FUNCIONES_RESUMEN' AS seccion,
  fn.nombre AS function_name,
  CASE WHEN p.oid IS NOT NULL THEN 'EXISTE' ELSE 'NO_EXISTE' END AS estado
FROM (
  VALUES
    ('get_current_office_user_context'),
    ('user_can_manage_empresa_usuarios'),
    ('es_jefe_de'),
    ('user_can_access_empresa'),
    ('user_can_access_servicio')
) AS fn(nombre)
LEFT JOIN pg_proc p
  ON p.proname = fn.nombre
 AND p.pronamespace = 'public'::regnamespace
ORDER BY fn.nombre;


-- =============================================================================
-- SECCIÓN 5: POLICIES
-- =============================================================================
SELECT
  'SECCION_5_POLICIES' AS seccion,
  pol.schemaname,
  pol.tablename,
  pol.policyname,
  pol.cmd,
  pol.roles,
  pol.permissive,
  pol.qual AS using_expression,
  pol.with_check AS with_check_expression
FROM pg_policies pol
WHERE pol.schemaname = 'public'
  AND pol.tablename IN (
    'empresa_usuarios',
    'empresas',
    'servicios',
    'servicio_documentos_extra',
    'push_schedule'
  )
ORDER BY pol.tablename, pol.policyname;

SELECT
  'SECCION_5_POLICIES_OFICINA' AS seccion,
  chk.policyname,
  chk.tablename,
  CASE WHEN pol.policyname IS NOT NULL THEN 'EXISTE' ELSE 'NO_EXISTE' END AS estado
FROM (
  VALUES
    ('eu_sel', 'empresa_usuarios'),
    ('eu_ins', 'empresa_usuarios'),
    ('eu_upd', 'empresa_usuarios'),
    ('emp_sel_oficina_demo', 'empresas')
) AS chk(policyname, tablename)
LEFT JOIN pg_policies pol
  ON pol.schemaname = 'public'
 AND pol.tablename = chk.tablename
 AND pol.policyname = chk.policyname
ORDER BY chk.tablename, chk.policyname;


-- =============================================================================
-- SECCIÓN 6: TRIGGERS
-- =============================================================================
SELECT
  'SECCION_6_TRIGGERS' AS seccion,
  n.nspname AS schema_name,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  CASE
    WHEN t.tgenabled = 'O' THEN 'ENABLED'
    WHEN t.tgenabled = 'D' THEN 'DISABLED'
    ELSE t.tgenabled::text
  END AS trigger_status,
  pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND c.relname IN (
    'empresa_usuarios',
    'servicios',
    'empresas',
    'profiles'
  )
ORDER BY c.relname, t.tgname;


-- =============================================================================
-- SECCIÓN 7: RLS ACTIVO
-- =============================================================================
SELECT
  'SECCION_7_RLS' AS seccion,
  expected.table_name,
  CASE WHEN c.oid IS NULL THEN 'TABLA_NO_EXISTE' ELSE
    CASE WHEN c.relrowsecurity THEN 'RLS_ACTIVO' ELSE 'RLS_INACTIVO' END
  END AS rls_estado,
  COALESCE(c.relforcerowsecurity, false) AS rls_forced
FROM (
  VALUES
    ('empresa_usuarios'),
    ('empresas'),
    ('servicios'),
    ('profiles'),
    ('conductor_empresa')
) AS expected(table_name)
LEFT JOIN pg_class c
  ON c.relname = expected.table_name
LEFT JOIN pg_namespace n
  ON n.oid = c.relnamespace
 AND n.nspname = 'public'
ORDER BY expected.table_name;


-- =============================================================================
-- SECCIÓN 8: CONTEOS (tablas base siempre; oficina solo indicador)
-- =============================================================================
SELECT
  'SECCION_8_CONTEOS' AS seccion,
  'empresas' AS tabla,
  count(*)::bigint AS filas,
  NULL::text AS nota
FROM public.empresas
UNION ALL
SELECT 'SECCION_8_CONTEOS', 'profiles', count(*)::bigint, NULL::text FROM public.profiles
UNION ALL
SELECT 'SECCION_8_CONTEOS', 'conductor_empresa', count(*)::bigint, NULL::text FROM public.conductor_empresa
UNION ALL
SELECT
  'SECCION_8_CONTEOS',
  'empresa_usuarios',
  NULL::bigint,
  CASE
    WHEN to_regclass('public.empresa_usuarios') IS NULL THEN 'TABLA_NO_EXISTE — BLOQUE B no aplica'
    ELSE 'TABLA_EXISTE — ejecutar BLOQUE B para contar filas'
  END
UNION ALL
SELECT 'SECCION_8_CONTEOS', 'servicios_total', count(*)::bigint, NULL::text FROM public.servicios
UNION ALL
SELECT
  'SECCION_8_CONTEOS',
  'servicios_con_responsable_user_id',
  NULL::bigint,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'servicios'
        AND column_name = 'responsable_user_id'
    ) THEN 'COLUMNA_NO_EXISTE'
    ELSE 'COLUMNA_EXISTE — ejecutar BLOQUE B para contar'
  END;


-- =============================================================================
-- SECCIÓN 9: INCONSISTENCIAS (solo catálogo; detalle en BLOQUE B)
-- =============================================================================
SELECT
  'SECCION_9_INCONSISTENCIAS' AS seccion,
  'detalle_datos' AS check_id,
  CASE
    WHEN to_regclass('public.empresa_usuarios') IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'servicios'
         AND column_name = 'responsable_user_id'
     )
    THEN 'SIN_OBJETOS_OFICINA — BLOQUE B no necesario'
    WHEN to_regclass('public.empresa_usuarios') IS NULL
    THEN 'SIN_TABLA_OFICINA — BLOQUE B parcial (solo servicios.responsable)'
    ELSE 'EJECUTAR_BLOQUE_B — detalle de huérfanos y owners'
  END AS accion_recomendada;


-- =============================================================================
-- SECCIÓN 10: DIAGNÓSTICO FINAL
-- =============================================================================
SELECT
  'SECCION_10_DIAGNOSTICO' AS seccion,
  checks.check_id,
  checks.descripcion,
  checks.resultado,
  checks.detalle
FROM (
  SELECT
    'tabla_empresa_usuarios' AS check_id,
    'Tabla empresa_usuarios' AS descripcion,
    CASE WHEN to_regclass('public.empresa_usuarios') IS NOT NULL THEN 'RESTO_DETECTADO' ELSE 'AUSENTE' END AS resultado,
    CASE WHEN to_regclass('public.empresa_usuarios') IS NOT NULL
      THEN 'Existe — posible resto del intento anterior'
      ELSE 'No existe' END AS detalle

  UNION ALL
  SELECT
    'tabla_usuarios_empresa',
    'Tabla usuarios_empresa (nombre alternativo)',
    CASE WHEN to_regclass('public.usuarios_empresa') IS NOT NULL THEN 'RESTO_DETECTADO' ELSE 'AUSENTE' END,
    CASE WHEN to_regclass('public.usuarios_empresa') IS NOT NULL
      THEN 'Existe tabla con nombre distinto'
      ELSE 'No existe' END

  UNION ALL
  SELECT
    'columna_responsable_user_id',
    'Columna servicios.responsable_user_id',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'servicios'
        AND column_name = 'responsable_user_id'
    ) THEN 'RESTO_DETECTADO' ELSE 'AUSENTE' END,
    'Columna del intento anterior en servicios'

  UNION ALL
  SELECT
    'funcion_user_can_manage',
    'user_can_manage_empresa_usuarios()',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'user_can_manage_empresa_usuarios'
    ) THEN 'RESTO_DETECTADO' ELSE 'AUSENTE' END,
    'Helper RLS del intento anterior'

  UNION ALL
  SELECT
    'funcion_get_current_office_user_context',
    'get_current_office_user_context()',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_current_office_user_context'
    ) THEN 'EXISTE' ELSE 'AUSENTE' END,
    'Función nueva (no del rollback v1)'

  UNION ALL
  SELECT
    'policy_eu_sel', 'Policy eu_sel',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'empresa_usuarios' AND policyname = 'eu_sel'
    ) THEN 'RESTO_DETECTADO' ELSE 'AUSENTE' END, 'RLS SELECT oficina'

  UNION ALL
  SELECT
    'policy_eu_ins', 'Policy eu_ins',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'empresa_usuarios' AND policyname = 'eu_ins'
    ) THEN 'RESTO_DETECTADO' ELSE 'AUSENTE' END, 'RLS INSERT oficina'

  UNION ALL
  SELECT
    'policy_eu_upd', 'Policy eu_upd',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'empresa_usuarios' AND policyname = 'eu_upd'
    ) THEN 'RESTO_DETECTADO' ELSE 'AUSENTE' END, 'RLS UPDATE oficina'

  UNION ALL
  SELECT
    'policy_emp_sel_oficina_demo',
    'Policy emp_sel_oficina_demo en empresas',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'empresas' AND policyname = 'emp_sel_oficina_demo'
    ) THEN 'RESTO_DETECTADO' ELSE 'AUSENTE' END,
    'Lectura empresas para usuario oficina'

  UNION ALL
  SELECT
    'veredicto_multiusuario_oficina',
    '¿Quedaron restos del intento anterior?',
    CASE
      WHEN to_regclass('public.empresa_usuarios') IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'servicios'
            AND column_name = 'responsable_user_id'
        )
        OR EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'user_can_manage_empresa_usuarios'
        )
        OR EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND (
              (tablename = 'empresa_usuarios' AND policyname IN ('eu_sel', 'eu_ins', 'eu_upd'))
              OR (tablename = 'empresas' AND policyname = 'emp_sel_oficina_demo')
            )
        )
      THEN 'SI_HAY_RESTOS'
      ELSE 'NO_HAY_RESTOS_CLAROS'
    END,
    'Decisión: reutilizar objetos existentes vs SQL limpio antes de implementar v2'
) AS checks
ORDER BY checks.check_id;


-- #############################################################################
-- BLOQUE B — OPCIONAL (ejecutar solo si SECCIÓN 10 indica SI_HAY_RESTOS
--            y/o empresa_usuarios EXISTE)
-- Si alguna query falla con "relation does not exist", la tabla ya no está.
-- #############################################################################


-- B.1 Conteos detallados oficina / responsable
SELECT 'BLOQUE_B_CONTEOS' AS seccion, 'empresa_usuarios' AS tabla, count(*)::bigint AS filas
FROM public.empresa_usuarios;

SELECT
  'BLOQUE_B_CONTEOS' AS seccion,
  'servicios_con_responsable_user_id' AS tabla,
  count(*)::bigint AS filas
FROM public.servicios
WHERE responsable_user_id IS NOT NULL;

SELECT
  'BLOQUE_B_CONTEOS' AS seccion,
  'servicios_sin_responsable_user_id' AS tabla,
  count(*)::bigint AS filas
FROM public.servicios
WHERE responsable_user_id IS NULL;


-- B.2 Empresas con owner_id pero sin jefe_flota activo en empresa_usuarios
SELECT
  'BLOQUE_B_INCONSISTENCIAS' AS seccion,
  'empresas_owner_sin_jefe_flota_activo' AS check_id,
  e.id AS empresa_id,
  e.nombre AS empresa_nombre,
  e.owner_id,
  eu.id AS empresa_usuario_id,
  eu.rol,
  eu.activo
FROM public.empresas e
LEFT JOIN public.empresa_usuarios eu
  ON eu.empresa_id = e.id
 AND eu.user_id = e.owner_id
 AND eu.rol = 'jefe_flota'
 AND eu.activo = true
WHERE eu.id IS NULL
ORDER BY e.created_at;


-- B.3 empresa_usuarios sin auth.users
SELECT
  'BLOQUE_B_INCONSISTENCIAS' AS seccion,
  'empresa_usuarios_sin_auth_user' AS check_id,
  eu.id,
  eu.empresa_id,
  eu.user_id,
  eu.email,
  eu.rol,
  eu.activo
FROM public.empresa_usuarios eu
LEFT JOIN auth.users u ON u.id = eu.user_id
WHERE u.id IS NULL;


-- B.4 empresa_usuarios sin profile
SELECT
  'BLOQUE_B_INCONSISTENCIAS' AS seccion,
  'empresa_usuarios_sin_profile' AS check_id,
  eu.id,
  eu.empresa_id,
  eu.user_id,
  eu.email,
  eu.rol,
  eu.activo
FROM public.empresa_usuarios eu
LEFT JOIN public.profiles p ON p.id = eu.user_id
WHERE p.id IS NULL;


-- B.5 servicios con responsable_user_id sin auth.users
SELECT
  'BLOQUE_B_INCONSISTENCIAS' AS seccion,
  'servicios_responsable_sin_auth_user' AS check_id,
  s.id AS servicio_id,
  s.empresa_id,
  s.responsable_user_id,
  s.estado,
  s.created_at
FROM public.servicios s
LEFT JOIN auth.users u ON u.id = s.responsable_user_id
WHERE s.responsable_user_id IS NOT NULL
  AND u.id IS NULL
ORDER BY s.created_at DESC;


-- B.6 servicios con responsable no vinculado a empresa_usuarios activo
SELECT
  'BLOQUE_B_INCONSISTENCIAS' AS seccion,
  'servicios_responsable_no_en_empresa_usuarios_activo' AS check_id,
  s.id AS servicio_id,
  s.empresa_id,
  s.responsable_user_id,
  eu.rol,
  eu.activo
FROM public.servicios s
LEFT JOIN public.empresa_usuarios eu
  ON eu.empresa_id = s.empresa_id
 AND eu.user_id = s.responsable_user_id
 AND eu.activo = true
WHERE s.responsable_user_id IS NOT NULL
  AND eu.id IS NULL
ORDER BY s.created_at DESC;


-- B.7 Muestra servicios sin responsable_user_id (máx. 50)
SELECT
  'BLOQUE_B_INCONSISTENCIAS' AS seccion,
  'servicios_sin_responsable_muestra' AS check_id,
  s.id AS servicio_id,
  s.empresa_id,
  s.conductor_id,
  s.estado,
  s.created_at
FROM public.servicios s
WHERE s.responsable_user_id IS NULL
ORDER BY s.created_at DESC
LIMIT 50;
