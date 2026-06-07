#!/usr/bin/env node
/**
 * Fix RLS join empresas DEMO (conductor_lee_empresa + emp_sel PERMISSIVE).
 *
 * Uso:
 *   set SUPABASE_DB_URL_DEMO=postgresql://...
 *   node scripts/apply-empresas-join-rls-demo-fix.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROD_REF = "glyexutcypmhkndvmcxd";
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(
  __dirname,
  "../supabase/migrations/20260613120000_empresas_join_rls_demo_fix.sql",
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

console.log("=== Fix RLS join empresas DEMO ===");
const r = spawnSync("node", ["scripts/apply-sql-file.mjs", MIGRATION], {
  stdio: "inherit",
  env: process.env,
});
if (r.status !== 0) process.exit(r.status ?? 1);

console.log("\nOK — Ejecuta scripts/audit-empresas-join-demo.sql y prueba DEMO-7562.\n");
