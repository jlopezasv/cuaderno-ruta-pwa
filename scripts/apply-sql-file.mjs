#!/usr/bin/env node
/**
 * Aplica un archivo .sql contra Postgres (Supabase) vía psql.
 *
 * Uso demo:
 *   set SUPABASE_DB_URL_DEMO=postgresql://postgres.[ref]:[pass]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
 *   node scripts/apply-sql-file.mjs scripts/sql-pr1-incidencias-demo-FINAL.sql
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const file = process.argv[2];
const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

if (!file) {
  console.error("Uso: node scripts/apply-sql-file.mjs <ruta.sql>");
  process.exit(1);
}
if (!dbUrl) {
  console.error("Definir SUPABASE_DB_URL_DEMO o SUPABASE_DB_URL (connection string Postgres).");
  process.exit(1);
}

const abs = resolve(file);
const r = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", abs], {
  stdio: "inherit",
  env: process.env,
});

if (r.error) {
  console.error("psql no disponible:", r.error.message);
  console.error("Alternativa: pegar el SQL en Supabase Dashboard → SQL Editor (proyecto DEMO).");
  process.exit(1);
}
process.exit(r.status ?? 1);
