-- =============================================================================
-- PREFLIGHT producción REAL (glyexutcypmhkndvmcxd)
-- Ejecutar en Supabase SQL Editor → proyecto REAL.
--
-- Resultado 1: todos los checks (ordenados por sección)
-- Resultado 2: solo FALTA / ALERTA / REVISAR (acción requerida)
--
-- Migraciones prod (orden si FALTA):
--   20260530170000_multi_conductor_v1_asignaciones_select.sql
--   20260530180000_multi_conductor_stops_rls_repair.sql
--   20260530190000_multi_conductor_evidencias_rls_repair.sql
--   20260530200000_multi_conductor_fase2a_participacion.sql
--   20260531150000_servicio_documentos_empresa.sql
--   20260531160000_documentacion_envios_envio_cliente_demo.sql
--   20260531170000_documentacion_envios_cliente_mail_demo.sql
--   20260531210000_conductor_empresa_telefono_movil.sql
-- =============================================================================

WITH checks AS (

  SELECT '00_meta' AS seccion, 'proyecto_db' AS check_id,
    current_database()::text AS estado, NULL::text AS migracion_si_falta,
    'Proyecto REAL glyexutcypmhkndvmcxd' AS notas

  -- ─── Funciones RLS core ───
  UNION ALL SELECT '01_funciones', 'fn_user_can_access_servicio_existe',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'user_can_access_servicio'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260514120000 o 20260530170000', 'Prerrequisito RLS servicios'

  UNION ALL SELECT '01_funciones', 'fn_user_can_access_servicio_multi_conductor',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'user_can_access_servicio'
        AND pg_get_functiondef(p.oid) ILIKE '%servicio_asignaciones%'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530170000_multi_conductor_v1_asignaciones_select.sql',
    'Colaborador en servicio_asignaciones'

  UNION ALL SELECT '01_funciones', 'fn_user_can_insert_servicio_existe',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'user_can_insert_servicio'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260529200000_user_can_insert_servicio_definitive.sql', 'INSERT servicios'

  UNION ALL SELECT '01_funciones', 'fn_user_can_access_empresa_existe',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'user_can_access_empresa'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260514120000_rls_servicio_ownership_core.sql', 'Prerrequisito sdemp'

  -- ─── Multi-conductor Fase 2A ───
  UNION ALL SELECT '02_multi_conductor', 'col_sa_estado_participacion',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'servicio_asignaciones'
        AND column_name = 'estado_participacion'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530200000_multi_conductor_fase2a_participacion.sql', 'pendiente|activo|finalizado'

  UNION ALL SELECT '02_multi_conductor', 'col_sa_fecha_inicio_participacion',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'servicio_asignaciones'
        AND column_name = 'fecha_inicio_participacion'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530200000_multi_conductor_fase2a_participacion.sql', NULL

  UNION ALL SELECT '02_multi_conductor', 'col_sa_fecha_fin_participacion',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'servicio_asignaciones'
        AND column_name = 'fecha_fin_participacion'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530200000_multi_conductor_fase2a_participacion.sql', NULL

  UNION ALL SELECT '02_multi_conductor', 'chk_sa_estado_participacion',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'servicio_asignaciones_estado_participacion_chk'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530200000_multi_conductor_fase2a_participacion.sql', NULL

  UNION ALL SELECT '02_multi_conductor', 'idx_sa_participacion',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'servicio_asignaciones'
        AND indexname = 'idx_servicio_asignaciones_participacion'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530200000_multi_conductor_fase2a_participacion.sql', NULL

  -- ─── Stops policies (multi-conductor) ───
  UNION ALL SELECT '03_stops', 'policy_stp_sel',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'stops' AND policyname = 'stp_sel'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530180000_multi_conductor_stops_rls_repair.sql', NULL

  UNION ALL SELECT '03_stops', 'policy_stp_ins',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'stops' AND policyname = 'stp_ins'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530180000_multi_conductor_stops_rls_repair.sql', NULL

  UNION ALL SELECT '03_stops', 'policy_stp_upd',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'stops' AND policyname = 'stp_upd'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530180000_multi_conductor_stops_rls_repair.sql', NULL

  UNION ALL SELECT '03_stops', 'policy_stp_del',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'stops' AND policyname = 'stp_del'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530180000_multi_conductor_stops_rls_repair.sql', NULL

  UNION ALL SELECT '03_stops', 'NO_legacy_stops_acceso',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'stops' AND policyname = 'stops_acceso'
    ) THEN 'OK' ELSE 'ALERTA' END,
    '20260530180000_multi_conductor_stops_rls_repair.sql', 'Legacy bloquea colaborador'

  -- ─── Evidencias policies (multi-conductor) ───
  UNION ALL SELECT '04_evidencias', 'policy_ev_sel',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'evidencias' AND policyname = 'ev_sel'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530190000_multi_conductor_evidencias_rls_repair.sql', NULL

  UNION ALL SELECT '04_evidencias', 'policy_ev_ins',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'evidencias' AND policyname = 'ev_ins'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530190000_multi_conductor_evidencias_rls_repair.sql', NULL

  UNION ALL SELECT '04_evidencias', 'policy_ev_upd',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'evidencias' AND policyname = 'ev_upd'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530190000_multi_conductor_evidencias_rls_repair.sql', NULL

  UNION ALL SELECT '04_evidencias', 'policy_ev_del',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'evidencias' AND policyname = 'ev_del'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260530190000_multi_conductor_evidencias_rls_repair.sql', NULL

  UNION ALL SELECT '04_evidencias', 'NO_legacy_evidencias_acceso',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'evidencias' AND policyname = 'evidencias_acceso'
    ) THEN 'OK' ELSE 'ALERTA' END,
    '20260530190000_multi_conductor_evidencias_rls_repair.sql', 'Legacy bloquea colaborador'

  -- ─── servicio_documentos_empresa ───
  UNION ALL SELECT '05_documentos_empresa', 'tabla_servicio_documentos_empresa',
    CASE WHEN to_regclass('public.servicio_documentos_empresa') IS NOT NULL
      THEN 'OK' ELSE 'FALTA' END,
    '20260531150000_servicio_documentos_empresa.sql', 'NO usar *_demo.sql'

  UNION ALL SELECT '05_documentos_empresa', 'col_sdemp_servicio_id',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'servicio_documentos_empresa'
        AND column_name = 'servicio_id'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531150000_servicio_documentos_empresa.sql', NULL

  UNION ALL SELECT '05_documentos_empresa', 'col_sdemp_empresa_id',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'servicio_documentos_empresa'
        AND column_name = 'empresa_id'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531150000_servicio_documentos_empresa.sql', NULL

  UNION ALL SELECT '05_documentos_empresa', 'idx_sdemp_servicio_created',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'servicio_documentos_empresa'
        AND indexname = 'idx_servicio_documentos_empresa_servicio_created'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531150000_servicio_documentos_empresa.sql', NULL

  UNION ALL SELECT '05_documentos_empresa', 'policy_sdemp_sel',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'servicio_documentos_empresa'
        AND policyname = 'sdemp_sel'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531150000_servicio_documentos_empresa.sql', NULL

  UNION ALL SELECT '05_documentos_empresa', 'policy_sdemp_ins',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'servicio_documentos_empresa'
        AND policyname = 'sdemp_ins'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531150000_servicio_documentos_empresa.sql', NULL

  UNION ALL SELECT '05_documentos_empresa', 'policy_sdemp_del',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'servicio_documentos_empresa'
        AND policyname = 'sdemp_del'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531150000_servicio_documentos_empresa.sql', NULL

  -- ─── documentacion_envios (mail cliente) ───
  UNION ALL SELECT '06_mail_cliente', 'tabla_documentacion_envios',
    CASE WHEN to_regclass('public.documentacion_envios') IS NOT NULL
      THEN 'OK' ELSE 'FALTA' END,
    '20260513120000_servicio_extra_docs_mail.sql', 'Baseline mail'

  UNION ALL SELECT '06_mail_cliente', 'col_de_cc',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios'
        AND column_name = 'cc'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531160000_documentacion_envios_envio_cliente_demo.sql', 'ADD COLUMN seguro'

  UNION ALL SELECT '06_mail_cliente', 'col_de_sent_at',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios'
        AND column_name = 'sent_at'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531160000_documentacion_envios_envio_cliente_demo.sql', NULL

  UNION ALL SELECT '06_mail_cliente', 'col_de_destinatario',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios'
        AND column_name = 'destinatario'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531170000_documentacion_envios_cliente_mail_demo.sql', NULL

  UNION ALL SELECT '06_mail_cliente', 'col_de_remitente_mostrado',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios'
        AND column_name = 'remitente_mostrado'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531170000_documentacion_envios_cliente_mail_demo.sql', NULL

  UNION ALL SELECT '06_mail_cliente', 'col_de_reply_to',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios'
        AND column_name = 'reply_to'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531170000_documentacion_envios_cliente_mail_demo.sql', NULL

  UNION ALL SELECT '06_mail_cliente', 'col_de_provider',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios'
        AND column_name = 'provider'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531170000_documentacion_envios_cliente_mail_demo.sql', NULL

  UNION ALL SELECT '06_mail_cliente', 'col_de_provider_message_id',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios'
        AND column_name = 'provider_message_id'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531170000_documentacion_envios_cliente_mail_demo.sql', NULL

  -- ─── conductor_empresa ───
  UNION ALL SELECT '07_conductor_empresa', 'col_ce_telefono_movil',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'conductor_empresa'
        AND column_name = 'telefono_movil'
    ) THEN 'OK' ELSE 'FALTA' END,
    '20260531210000_conductor_empresa_telefono_movil.sql', NULL

  -- ─── Join conductor (empresas) ───
  UNION ALL SELECT '08_join_conductor', 'policy_empresas_conductor_lee_empresa',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'empresas'
        AND policyname = 'conductor_lee_empresa'
    ) THEN 'OK' ELSE 'FALTA' END,
    NULL, 'Legacy prod — NO aplicar 20260612120000 (DEMO)'

  UNION ALL SELECT '08_join_conductor', 'policy_ce_insert_conductor_join',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'conductor_empresa'
        AND cmd = 'INSERT'
        AND policyname IN ('conductor_join', 'ce_ins')
    ) THEN 'OK' ELSE 'REVISAR' END,
    NULL, 'conductor_join (legacy) o ce_ins (core)'

  UNION ALL SELECT '08_join_conductor', 'rpc_lookup_empresa_por_codigo',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'lookup_empresa_por_codigo'
    ) THEN 'OK' ELSE 'FALTA' END,
    'scripts/apply-prod-empresas-join-lookup.sql', 'Join conductor por código (REAL)'

  -- ─── Alertas: objetos DEMO no deben estar en REAL ───
  UNION ALL SELECT '09_no_demo', 'NO_tabla_empresa_usuarios',
    CASE WHEN to_regclass('public.empresa_usuarios') IS NULL
      THEN 'OK' ELSE 'ALERTA' END, NULL, 'Solo DEMO'

  UNION ALL SELECT '09_no_demo', 'NO_col_servicios_responsable_user_id',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'servicios'
        AND column_name = 'responsable_user_id'
    ) THEN 'OK' ELSE 'ALERTA' END, NULL, 'Solo DEMO'

  UNION ALL SELECT '09_no_demo', 'NO_rpc_get_current_office_user_context',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_current_office_user_context'
    ) THEN 'OK' ELSE 'ALERTA' END, NULL, 'Solo DEMO'

  UNION ALL SELECT '09_no_demo', 'NO_policy_emp_sel_oficina_demo',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'empresas'
        AND policyname = 'emp_sel_oficina_demo'
    ) THEN 'OK' ELSE 'ALERTA' END, NULL, 'Solo DEMO'

  UNION ALL SELECT '09_no_demo', 'NO_policies_empresa_usuarios',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'empresa_usuarios'
    ) THEN 'OK' ELSE 'ALERTA' END, NULL, 'eu_sel/ins/upd — solo DEMO'

)

SELECT
  seccion,
  check_id,
  estado,
  migracion_si_falta,
  notas,
  (estado IN ('FALTA', 'ALERTA', 'REVISAR')) AS requiere_accion
FROM checks
ORDER BY
  CASE WHEN estado IN ('FALTA', 'ALERTA', 'REVISAR') THEN 0 ELSE 1 END,
  seccion,
  check_id;
