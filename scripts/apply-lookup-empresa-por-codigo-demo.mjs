#!/usr/bin/env node
/**
 * RPC lookup_empresa_por_codigo — SOLO Supabase DEMO.
 *
 * Uso:
 *   set SUPABASE_DB_URL_DEMO=postgresql://...
 *   node scripts/apply-lookup-empresa-por-codigo-demo.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROD_REF = "glyexutcypmhkndvmcxd";
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(
  __dirname,
  "../supabase/migrations/20260614120000_lookup_empresa_por_codigo_demo.sql",
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

console.log("=== RPC lookup_empresa_por_codigo (DEMO join) ===");
const r = spawnSync("node", ["scripts/apply-sql-file.mjs", MIGRATION], {
  stdio: "inherit",
  env: process.env,
});
if (r.status !== 0) process.exit(r.status ?? 1);

console.log("\nOK — Prueba conductor → DEMO-7562 en https://cuaderno-demo-ab.vercel.app\n");
