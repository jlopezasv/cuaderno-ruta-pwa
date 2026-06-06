#!/usr/bin/env node
/**
 * Aplica migración empresa_usuarios SOLO en Supabase DEMO.
 * Bloquea si la URL contiene el ref de producción (glyexutcypmhkndvmcxd).
 *
 * Uso:
 *   set SUPABASE_DB_URL_DEMO=postgresql://postgres.[ref-demo]:[pass]@...
 *   node scripts/apply-empresa-usuarios-demo.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROD_REF = "glyexutcypmhkndvmcxd";
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(__dirname, "../supabase/migrations/20260605120000_empresa_usuarios_oficina_demo.sql");
const VERIFY = resolve(__dirname, "verify-empresa-usuarios-demo.sql");

const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("ERROR: Definir SUPABASE_DB_URL_DEMO (connection string Postgres del proyecto DEMO).");
  process.exit(1);
}

if (dbUrl.includes(PROD_REF)) {
  console.error(`ERROR: La URL apunta a PRODUCCIÓN (${PROD_REF}). Abortado.`);
  process.exit(1);
}

let host = "(desconocido)";
try {
  const u = new URL(dbUrl.replace(/^postgresql:/, "http:"));
  host = u.hostname;
} catch {
  host = dbUrl.includes("@") ? dbUrl.split("@")[1]?.split("/")[0] : "(parse error)";
}

console.log("=== Pre-check DEMO ===");
console.log("Host destino:", host);
console.log("Ref producción bloqueado:", PROD_REF);
console.log("Contiene ref producción:", dbUrl.includes(PROD_REF) ? "SÍ — ABORT" : "NO — OK");
console.log("Migración:", MIGRATION);

function runPsql(file, label) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", file], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.error) {
    console.error("psql no disponible:", r.error.message);
    console.error("Alternativa: pegar el SQL en Supabase Dashboard → SQL Editor (proyecto DEMO).");
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`${label} falló (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

runPsql(MIGRATION, "Aplicar migración");
runPsql(VERIFY, "Verificación");

console.log("\n=== OK — migración aplicada en DEMO ===");
