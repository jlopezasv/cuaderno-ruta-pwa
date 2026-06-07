#!/usr/bin/env node
/**
 * Restaura policy conductor_lee_empresa en empresas — SOLO Supabase DEMO.
 *
 * Uso:
 *   set SUPABASE_DB_URL_DEMO=postgresql://...
 *   node scripts/apply-empresas-sel-conductor-vinculo-demo.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROD_REF = "glyexutcypmhkndvmcxd";
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(
  __dirname,
  "../supabase/migrations/20260612120000_empresas_sel_conductor_vinculo_demo.sql",
);

const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("ERROR: Definir SUPABASE_DB_URL_DEMO.");
  console.error("Alternativa: SQL Editor DEMO →", MIGRATION);
  process.exit(1);
}

if (dbUrl.includes(PROD_REF)) {
  console.error(`ERROR: URL apunta a PRODUCCIÓN (${PROD_REF}). Abortado.`);
  process.exit(1);
}

console.log("=== Aplicar conductor_lee_empresa (DEMO join team) ===");
const r = spawnSync("node", ["scripts/apply-sql-file.mjs", MIGRATION], {
  stdio: "inherit",
  env: process.env,
});
if (r.status !== 0) process.exit(r.status ?? 1);

console.log("\nOK — Policy conductor_lee_empresa aplicada.");
console.log("Prueba: conductor → código DEMO-7562 → lookup_ok en consola.\n");
