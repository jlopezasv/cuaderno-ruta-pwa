#!/usr/bin/env node
/**
 * Aplica RLS peer SELECT en empresa_usuarios — SOLO Supabase DEMO.
 * Permite a usuario oficina activo leer compañeros de la misma empresa.
 *
 * Uso:
 *   set SUPABASE_DB_URL_DEMO=postgresql://...
 *   npm run deploy:demo:office-peer-rls
 *
 * Sin URL: pegar en SQL Editor DEMO:
 *   supabase/migrations/20260611120000_empresa_usuarios_sel_peer_demo_fix.sql
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROD_REF = "glyexutcypmhkndvmcxd";
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(
  __dirname,
  "../supabase/migrations/20260611120000_empresa_usuarios_sel_peer_demo_fix.sql",
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

console.log("=== Aplicar fix eu_sel_peer_demo (DEMO, sin recursión RLS) ===");
const r = spawnSync("node", ["scripts/apply-sql-file.mjs", MIGRATION], {
  stdio: "inherit",
  env: process.env,
});
if (r.status !== 0) process.exit(r.status ?? 1);

console.log("\nOK — Policy eu_sel_peer_demo aplicada.");
console.log("Verifica: recarga sesión jefe_flota → Config → Usuarios de oficina.\n");
