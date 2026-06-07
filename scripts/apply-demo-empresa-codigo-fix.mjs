#!/usr/bin/env node
/**
 * Aplica fix codigo_equipo + RPC contexto oficina SOLO en Supabase DEMO.
 *
 * Uso:
 *   set SUPABASE_DB_URL_DEMO=postgresql://...
 *   node scripts/apply-demo-empresa-codigo-fix.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROD_REF = "glyexutcypmhkndvmcxd";
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(
  __dirname,
  "../supabase/migrations/20260610120000_demo_empresa_codigo_equipo_context.sql",
);

const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("ERROR: Definir SUPABASE_DB_URL_DEMO.");
  process.exit(1);
}

if (dbUrl.includes(PROD_REF)) {
  console.error(`ERROR: URL apunta a PRODUCCIÓN (${PROD_REF}). Abortado.`);
  process.exit(1);
}

console.log("=== Aplicar fix codigo_equipo DEMO ===");
const r = spawnSync("node", ["scripts/apply-sql-file.mjs", MIGRATION], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
