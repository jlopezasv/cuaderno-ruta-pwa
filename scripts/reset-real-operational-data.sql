-- =============================================================================
-- RESET OPERACIONAL — Supabase REAL (Cuaderno PWA)
-- =============================================================================
--
-- PROPÓSITO
--   Borrar SOLO datos operativos, usuarios, sesiones y ficheros de Storage.
--   Dejar el proyecto listo para arrancar “en frío” (login limpio, sin QA/demo).
--
-- QUÉ HACE
--   • DELETE en tablas public.* (datos)
--   • DELETE en storage.objects (ficheros de buckets user-photos y cmr)
--   • DELETE en auth.* (usuarios, sesiones, refresh tokens)
--
-- QUÉ NO TOCA (explícito)
--   ✗ Schema (CREATE / ALTER TABLE / DROP TABLE)
--   ✗ RLS, políticas (policies), GRANTs
--   ✗ Funciones, triggers, vistas
--   ✗ Definición de buckets (storage.buckets) — solo los OBJECTS dentro
--   ✗ Migraciones, extensiones, configuración del proyecto Supabase/Vercel
--   ✗ Realtime publication, Edge Functions, webhooks Stripe, etc.
--
-- DÓNDE EJECUTAR
--   Supabase Dashboard → SQL Editor → proyecto REAL (glyexutcypmhkndvmcxd)
--   Rol: postgres (o service_role con permisos auth + storage)
--
-- MODO SEGURO (recomendado la 1ª vez)
--   1) Ejecutar solo el bloque «0) Conteos previos» (copiar hasta el primer DO de DELETE).
--   2) Comentar COMMIT y descomentar ROLLBACK → simula sin persistir.
--   3) Revisar NOTICE en consola; si conteos finales = 0, COMMIT real.
--
-- ⚠️  IRREVERSIBLE salvo backups / Point-in-Time Recovery de Supabase.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0) Conteos previos (solo lectura — no borra nada)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_users bigint;
  v_objects bigint;
BEGIN
  RAISE NOTICE '=== RESET REAL — conteos ANTES ===';
  FOR r IN
    SELECT relname AS tbl, n_live_tup::bigint AS est
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
      AND relname = ANY (ARRAY[
        'evidencias', 'stops', 'servicios', 'empresas', 'conductor_empresa',
        'profiles', 'ubicaciones', 'servicio_documentos_extra', 'documentacion_envios',
        'servicio_asignaciones', 'asignaciones', 'servicio_cambios',
        'entries', 'gastos', 'km_logs', 'cmr_docs', 'documentos', 'parkings',
        'push_tokens', 'push_subscriptions', 'push_schedule', 'subscriptions'
      ])
    ORDER BY relname
  LOOP
    RAISE NOTICE '  public.% : ~% filas (est.)', r.tbl, r.est;
  END LOOP;

  IF to_regclass('auth.users') IS NOT NULL THEN
    SELECT count(*) INTO v_users FROM auth.users;
    RAISE NOTICE '  auth.users : %', v_users;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    SELECT count(*) INTO v_objects
    FROM storage.objects
    WHERE bucket_id IN ('user-photos', 'cmr');
    RAISE NOTICE '  storage.objects (user-photos, cmr) : %', v_objects;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 1) Storage — solo FICHEROS (storage.objects), NO borra storage.buckets
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_n bigint;
BEGIN
  RAISE NOTICE '=== 1) Storage (objects únicamente) ===';

  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE '  SKIP storage.objects';
  ELSE
    DELETE FROM storage.objects
    WHERE bucket_id IN ('user-photos', 'cmr');
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '  storage.objects → % filas', v_n;
  END IF;

  IF to_regclass('storage.s3_multipart_uploads') IS NOT NULL THEN
    DELETE FROM storage.s3_multipart_uploads
    WHERE bucket_id IN ('user-photos', 'cmr');
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '  storage.s3_multipart_uploads → % filas', v_n;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2–7) public.* — orden por FK (hijos → padres)
--     Tablas opcionales: omitidas con to_regclass si no existen en REAL.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_n bigint;
  tbl text;
  -- Orden estricto por dependencias del proyecto Cuaderno PWA
  tables_ordered text[] := ARRAY[
    -- 2) Hijos de stops / servicios
    'evidencias',
    'servicio_asignaciones',
    'asignaciones',
    'servicio_cambios',
    'servicio_documentos_extra',
    'documentacion_envios',
    'cmr_docs',
    -- 3) Tracking (refs user, servicio, stop, empresa)
    'ubicaciones',
    -- 4) Paradas y servicios
    'stops',
    'servicios',
    -- 5) Empresa
    'conductor_empresa',
    'empresas',
    -- 6) Datos por usuario
    'entries',
    'gastos',
    'km_logs',
    'documentos',
    'parkings',
    'push_tokens',
    'push_subscriptions',
    'push_schedule',
    'subscriptions',
    -- 7) Perfiles (id = auth.users.id)
    'profiles'
  ];
BEGIN
  RAISE NOTICE '=== 2–7) public.* (datos operativos) ===';

  FOREACH tbl IN ARRAY tables_ordered
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      RAISE NOTICE '  SKIP public.%', tbl;
      CONTINUE;
    END IF;
    EXECUTE format('DELETE FROM public.%I', tbl);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '  public.% → % filas', tbl, v_n;
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 8) Auth — sesiones, refresh tokens, usuarios
--     NO modifica estructura auth.*; solo DELETE de filas.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_n bigint;
  tbl text;
  auth_tables_ordered text[] := ARRAY[
    'refresh_tokens',
    'sessions',
    'mfa_amr_claims',
    'mfa_challenges',
    'mfa_factors',
    'one_time_tokens',
    'flow_state',
    'identities',
    'users'
  ];
BEGIN
  RAISE NOTICE '=== 8) auth.* (sesiones + usuarios) ===';

  FOREACH tbl IN ARRAY auth_tables_ordered
  LOOP
    IF to_regclass('auth.' || tbl) IS NULL THEN
      RAISE NOTICE '  SKIP auth.%', tbl;
      CONTINUE;
    END IF;
    EXECUTE format('DELETE FROM auth.%I', tbl);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '  auth.% → % filas', tbl, v_n;
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 9) Conteos posteriores (misma transacción — esperado: 0)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_users bigint := 0;
  v_objects bigint := 0;
  v_servicios bigint := 0;
  v_profiles bigint := 0;
  v_evidencias bigint := 0;
BEGIN
  RAISE NOTICE '=== RESET REAL — conteos DESPUÉS (esperado: 0) ===';

  IF to_regclass('public.servicios') IS NOT NULL THEN
    SELECT count(*) INTO v_servicios FROM public.servicios;
    RAISE NOTICE '  public.servicios : %', v_servicios;
  END IF;

  IF to_regclass('public.evidencias') IS NOT NULL THEN
    SELECT count(*) INTO v_evidencias FROM public.evidencias;
    RAISE NOTICE '  public.evidencias : %', v_evidencias;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    SELECT count(*) INTO v_profiles FROM public.profiles;
    RAISE NOTICE '  public.profiles : %', v_profiles;
  END IF;

  IF to_regclass('auth.users') IS NOT NULL THEN
    SELECT count(*) INTO v_users FROM auth.users;
    RAISE NOTICE '  auth.users : %', v_users;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    SELECT count(*) INTO v_objects
    FROM storage.objects
    WHERE bucket_id IN ('user-photos', 'cmr');
    RAISE NOTICE '  storage.objects (user-photos, cmr) : %', v_objects;
  END IF;

  IF v_users > 0 OR v_objects > 0 OR v_servicios > 0 OR v_profiles > 0 OR v_evidencias > 0 THEN
    RAISE WARNING 'Quedan filas — revisa FKs o tablas no listadas antes de COMMIT.';
  ELSE
    RAISE NOTICE 'OK: conteos operativos principales en cero.';
  END IF;
END $$;


-- =============================================================================
-- Finalizar transacción
-- =============================================================================
-- Simulación (no persiste) — descomentar UNA de las dos:

-- ROLLBACK;

COMMIT;


-- =============================================================================
-- CHECKLIST POST-RESET (manual)
-- =============================================================================
--
-- [ ] Supabase → Authentication → Users: vacío
-- [ ] SQL: SELECT count(*) FROM public.servicios;   → 0
-- [ ] SQL: SELECT count(*) FROM public.evidencias;  → 0
-- [ ] SQL: SELECT count(*) FROM public.profiles;    → 0
-- [ ] SQL: SELECT count(*) FROM auth.users;         → 0
-- [ ] Storage → bucket user-photos: 0 objetos
-- [ ] Storage → bucket cmr: 0 objetos
-- [ ] Buckets siguen existiendo (no se eliminaron definiciones)
-- [ ] Login limpio en app Production (borrar sb_session / datos del sitio / PWA)
-- [ ] RLS intacta:
--       SELECT tablename, rowsecurity FROM pg_tables
--       WHERE schemaname = 'public' AND tablename IN ('servicios','evidencias','profiles');
-- [ ] Políticas intactas:
--       SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','storage');
-- [ ] Funciones intactas (ej. user_can_access_servicio):
--       SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND proname LIKE '%servicio%';
-- [ ] Sin usuarios demo (@cuaderno.test, UUID a0000000-… si los hubiera)
-- [ ] Recrear cuenta admin de producción de forma controlada
--
-- =============================================================================
