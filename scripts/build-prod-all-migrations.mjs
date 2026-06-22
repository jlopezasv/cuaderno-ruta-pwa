#!/usr/bin/env node
/**
 * Genera scripts/prod-all-migrations-consolidated.sql
 * Todas las migraciones de producción REAL, sin archivos solo-demo/debug.
 *
 *   node scripts/build-prod-all-migrations.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const out = resolve(__dirname, "prod-all-migrations-consolidated.sql");

/** Orden obligatorio. Excluye *_demo, debug_*, seeds, repair-*. */
const FILES = [
  // ── Baseline release (29) ──
  "supabase/migrations/20260513120000_servicio_extra_docs_mail.sql",
  "supabase/migrations/20260514120000_rls_servicio_ownership_core.sql",
  "scripts/prod-storage-and-legacy-rls-safe.sql",
  "supabase/migrations/20260516120000_profiles_is_archived.sql",
  "supabase/migrations/20260517130000_ubicaciones_operativa_columns.sql",
  "supabase/migrations/20260518120000_servicios_empresa_id_optional.sql",
  "supabase/migrations/20260518140000_empresas_codigo_equipo.sql",
  "supabase/migrations/20260518160000_revoke_anon_table_grants.sql",
  "supabase/migrations/20260518200000_ubicaciones_select_empresa_flota.sql",
  "supabase/migrations/20260519120000_evidencias_doc_meta.sql",
  "supabase/migrations/20260519120000_servicio_documentos_extra_schema_align.sql",
  "supabase/migrations/20260520130000_extra_docs_empresa_select.sql",
  "supabase/migrations/20260521120000_servicio_sin_conductor_y_asignaciones.sql",
  "supabase/migrations/20260521140000_servicios_rls_pendiente_asignacion.sql",
  "supabase/migrations/20260521150000_servicios_rls_sin_conductor_definitivo.sql",
  "supabase/migrations/20260521160000_servicios_estado_pendiente_asignacion.sql",
  "supabase/migrations/20260522120000_stops_rls_conductor_empresa.sql",
  "supabase/migrations/20260522130000_servicios_estado_cerrado.sql",
  "supabase/migrations/20260523120000_repair_servicios_rls_functions.sql",
  "supabase/migrations/20260525130000_fase1_cerrado_to_completado.sql",
  "supabase/migrations/20260526120000_incidencias_operativas.sql",
  "supabase/migrations/20260527120000_profiles_can_drive.sql",
  "supabase/migrations/20260528120000_product1_account_types.sql",
  "supabase/migrations/20260528140000_autonomo_pro_servicios_rls_repair.sql",
  "supabase/migrations/20260529120000_servicios_rls_autonomo_pro_ownership.sql",
  "supabase/migrations/20260529180000_fix_user_can_insert_servicio_autonomo_pro.sql",
  "supabase/migrations/20260529200000_user_can_insert_servicio_definitive.sql",
  "supabase/migrations/20260530150000_incidencias_autonomo_pro.sql",
  "supabase/migrations/20260530160000_autonomo_pro_servicio_tenant_enforce.sql",
  // ── Multi-conductor + documentos + mail ──
  "supabase/migrations/20260530170000_multi_conductor_v1_asignaciones_select.sql",
  "supabase/migrations/20260530180000_multi_conductor_stops_rls_repair.sql",
  "supabase/migrations/20260530190000_multi_conductor_evidencias_rls_repair.sql",
  "supabase/migrations/20260530200000_multi_conductor_fase2a_participacion.sql",
  "supabase/migrations/20260531150000_servicio_documentos_empresa.sql",
  "scripts/prod-mail-cliente-columns.sql",
  "supabase/migrations/20260531210000_conductor_empresa_telefono_movil.sql",
  // ── Join conductor + oficina ──
  "supabase/migrations/20260615120000_empresas_conductor_codigo_lookup_prod.sql",
  "supabase/migrations/20260617120000_empresa_usuarios_oficina_prod.sql",
  // ── Agenda comercial interna ──
  "supabase/migrations/20260701120000_agenda_comercial.sql",
  "supabase/migrations/20260706120000_admin_agenda_comercial.sql",
  "supabase/migrations/20260707120000_agenda_prospecto_campos_comerciales.sql",
  // ── DeCA + retención + remolque ──
  "supabase/migrations/20260708120000_data_retention_framework.sql",
  "supabase/migrations/20260709120000_dcdt_master_partes.sql",
  "supabase/migrations/20260710120000_dcdt_rename_from_carta_porte.sql",
  "supabase/migrations/20260710130000_fix_dcdt_rls_function_volatility.sql",
  "supabase/migrations/20260710140000_empresas_domicilio_dcdt.sql",
  "supabase/migrations/20260710150000_dcdt_pdf_retention_demo.sql",
  "supabase/migrations/20260712120000_dcdt_deca_public_id_demo.sql",
  "supabase/migrations/20260713120000_conductor_empresa_vehiculo_demo.sql",
  // ── Participación multi-conductor (soltar parada) ──
  "supabase/migrations/20260719120000_soltar_parada_guarded_rpc.sql",
];

const header = `-- =============================================================================
-- PRODUCCIÓN REAL — todas las migraciones (sin solo-demo / sin debug)
-- Proyecto: glyexutcypmhkndvmcxd (cuadernoderutapro.es / tacografo-pro)
-- Generado: ${new Date().toISOString().slice(0, 10)} — node scripts/build-prod-all-migrations.mjs
--
-- EXCLUIDO a propósito:
--   debug_servicio_insert_rls_context*
--   *_demo.sql (salvo SQL DeCA/remolque/deca_public_id incluidos aquí)
--   storage.objects directo → scripts/prod-storage-and-legacy-rls-safe.sql
--   demo_office_* / office insert RLS solo demo
--   service_messages, viaje_codigo, multi_deca_cargador, participacion_tipo
--   seeds y scripts repair-*
--
-- USO:
--   1. Ejecutar scripts/preflight-prod-sql-audit.sql y revisar FALTA
--   2. En proyecto REAL vacío o desactualizado: pegar TODO este archivo
--   3. En REAL ya parcialmente migrado: idempotente — solo aplica lo que falte
--
-- ORDEN: ${FILES.length} bloques (no reordenar)
-- =============================================================================

`;

const parts = [header];

for (const rel of FILES) {
  const abs = resolve(root, rel);
  let body;
  try {
    body = readFileSync(abs, "utf8").trim();
  } catch (e) {
    console.error(`Falta archivo: ${rel}`);
    process.exit(1);
  }
  if (!body) {
    console.warn(`[WARN] Archivo vacío omitido: ${rel}`);
    continue;
  }
  parts.push(`\n\n-- >>> FILE: ${rel}\n\n`);
  parts.push(body);
  parts.push(`\n\n-- <<< END ${rel}\n`);
}

parts.push(`
-- =============================================================================
-- FIN prod-all-migrations-consolidated.sql
-- Verificación rápida:
-- =============================================================================
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'user_can_access_servicio',
    'user_can_insert_servicio',
    'lookup_empresa_por_codigo',
    'get_current_office_user_context',
    'user_can_manage_dcdt_trafico',
    'soltar_parada_conductor_guarded'
  )
ORDER BY 1;
`);

writeFileSync(out, parts.join(""), "utf8");
console.log(`OK → ${out} (${FILES.length} archivos)`);
