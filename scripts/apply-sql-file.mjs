#!/usr/bin/env node
/**
 * Aplica un archivo .sql contra Postgres (Supabase).
 *
 * 1. Si `psql` está en PATH, lo usa (comportamiento original).
 * 2. Si no, usa el paquete `pg` de node_modules.
 *
 * Uso demo:
 *   $env:SUPABASE_DB_URL_DEMO = "postgresql://postgres.[ref]:[pass]@..."
 *   node scripts/apply-sql-file.mjs supabase/migrations/....sql
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const PROD_REF = "glyexutcypmhkndvmcxd";
const file = process.argv[2];
const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

if (!file) {
  console.error("Uso: node scripts/apply-sql-file.mjs <ruta.sql>");
  process.exit(1);
}
if (!dbUrl) {
  console.error("Definir SUPABASE_DB_URL_DEMO (connection string Postgres del proyecto DEMO).");
  process.exit(1);
}
if (dbUrl.includes(PROD_REF)) {
  console.error(`ERROR: la URL apunta a PRODUCCIÓN (${PROD_REF}). Abortado.`);
  process.exit(1);
}

const abs = resolve(file);

function psqlAvailable() {
  const r = spawnSync("psql", ["--version"], { stdio: "pipe", env: process.env });
  return !r.error && r.status === 0;
}

/** Líneas meta de psql (`\set`, `\i`, etc.) no son SQL válido para `pg`. */
function stripPsqlDirectives(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*\\/.test(line))
    .join("\n");
}

function reportSqlError(filePath, err, extra) {
  console.error("\n=== Error aplicando SQL ===");
  console.error("Archivo SQL:", filePath);
  if (extra) console.error(extra);
  console.error("Error:", err?.message || String(err));
  if (err?.detail) console.error("Detalle:", err.detail);
  if (err?.hint) console.error("Hint:", err.hint);
  if (err?.position) console.error("Posición:", err.position);
  process.exit(1);
}

async function runWithPg() {
  const sql = stripPsqlDirectives(readFileSync(abs, "utf8"));
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(sql);
    console.log("OK (pg):", abs);
  } catch (err) {
    reportSqlError(abs, err);
  } finally {
    await client.end().catch(() => {});
  }
}

function runWithPsql() {
  const r = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", abs], {
    stdio: "inherit",
    env: process.env,
  });
  if ((r.status ?? 1) !== 0) {
    reportSqlError(abs, new Error(`psql salió con código ${r.status ?? 1}`));
  }
}

if (psqlAvailable()) {
  runWithPsql();
} else {
  console.log("psql no disponible — usando paquete pg");
  await runWithPg();
}
