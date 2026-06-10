-- Checklist final REAL (glyexutcypmhkndvmcxd) — solo ítems release producción
-- Ejecutar en SQL Editor. Si hay FALTA/ALERTA → scripts/apply-prod-final-gaps.sql

WITH checks AS (

  -- 1) Mail cliente
  SELECT '01_mail' AS bloque, 'col_de_cc' AS item,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios' AND column_name = 'cc'
    ) THEN 'OK' ELSE 'FALTA' END AS estado,
    'apply-prod-final-gaps.sql' AS fix
  UNION ALL SELECT '01_mail', 'col_de_sent_at',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios' AND column_name = 'sent_at'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-final-gaps.sql'
  UNION ALL SELECT '01_mail', 'col_de_destinatario',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios' AND column_name = 'destinatario'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-final-gaps.sql'
  UNION ALL SELECT '01_mail', 'col_de_remitente_mostrado',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios' AND column_name = 'remitente_mostrado'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-final-gaps.sql'
  UNION ALL SELECT '01_mail', 'col_de_reply_to',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios' AND column_name = 'reply_to'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-final-gaps.sql'
  UNION ALL SELECT '01_mail', 'col_de_provider',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios' AND column_name = 'provider'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-final-gaps.sql'
  UNION ALL SELECT '01_mail', 'col_de_provider_message_id',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documentacion_envios' AND column_name = 'provider_message_id'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-final-gaps.sql'

  -- 2) Documentos empresa
  UNION ALL SELECT '02_documentos', 'tabla_servicio_documentos_empresa',
    CASE WHEN to_regclass('public.servicio_documentos_empresa') IS NOT NULL THEN 'OK' ELSE 'FALTA' END,
    'apply-prod-final-gaps.sql'
  UNION ALL SELECT '02_documentos', 'policy_sdemp_sel',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'servicio_documentos_empresa' AND policyname = 'sdemp_sel'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-final-gaps.sql'
  UNION ALL SELECT '02_documentos', 'policy_sdemp_ins',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'servicio_documentos_empresa' AND policyname = 'sdemp_ins'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-final-gaps.sql'
  UNION ALL SELECT '02_documentos', 'policy_sdemp_del',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'servicio_documentos_empresa' AND policyname = 'sdemp_del'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-final-gaps.sql'

  -- 3) Teléfono conductor
  UNION ALL SELECT '03_conductor', 'col_ce_telefono_movil',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'conductor_empresa' AND column_name = 'telefono_movil'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-final-gaps.sql'

  -- 4) Join conductor RPC
  UNION ALL SELECT '04_join', 'rpc_lookup_empresa_por_codigo',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'lookup_empresa_por_codigo'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-empresas-join-lookup.sql'

  -- 5) Multiusuario oficina (REAL = DEMO)
  UNION ALL SELECT '05_multiusuario', 'tabla_empresa_usuarios',
    CASE WHEN to_regclass('public.empresa_usuarios') IS NOT NULL THEN 'OK' ELSE 'FALTA' END,
    'apply-prod-multiusuario-oficina.mjs'
  UNION ALL SELECT '05_multiusuario', 'col_servicios_responsable_user_id',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'servicios' AND column_name = 'responsable_user_id'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-multiusuario-oficina.mjs'
  UNION ALL SELECT '05_multiusuario', 'col_servicios_responsable_nombre',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'servicios' AND column_name = 'responsable_nombre'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-multiusuario-oficina.mjs'
  UNION ALL SELECT '05_multiusuario', 'rpc_get_current_office_user_context',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_current_office_user_context'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-multiusuario-oficina.mjs'
  UNION ALL SELECT '05_multiusuario', 'rpc_user_can_manage_empresa_usuarios',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'user_can_manage_empresa_usuarios'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-multiusuario-oficina.mjs'
  UNION ALL SELECT '05_multiusuario', 'policy_eu_sel',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'empresa_usuarios' AND policyname = 'eu_sel'
    ) THEN 'OK' ELSE 'FALTA' END, 'apply-prod-multiusuario-oficina.mjs'

)

SELECT bloque, item, estado, fix
FROM checks
ORDER BY
  CASE WHEN estado IN ('FALTA', 'ALERTA') THEN 0 ELSE 1 END,
  bloque, item;

-- Solo pendientes:
-- SELECT * FROM checks WHERE estado IN ('FALTA', 'ALERTA') ORDER BY bloque, item;
