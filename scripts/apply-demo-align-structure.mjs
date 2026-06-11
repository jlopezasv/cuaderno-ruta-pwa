#!/usr/bin/env node
/**
 * Aplica demo-align-structure-from-prod.sql SOLO en Supabase DEMO.
 *
 * Requisitos:
 *   SUPABASE_DB_URL_DEMO=postgresql://postgres.fezacjtbavgdosncxlzw:...
 *
 * Uso:
 *   node scripts/apply-demo-align-structure.mjs
 *   node scripts/apply-demo-align-structure.mjs --dry-run   (solo valida URL)
 *
 * NO toca PRODUCCIÓN (glyexutcypmhkndvmcxd).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const sqlFile = resolve(__dirname, "demo-align-structure-from-prod.sql");
const DEMO_REF = "fezacjtbavgdosncxlzw";
const PROD_REF = "glyexutcypmhkndvmcxd";
const dryRun = process.argv.includes("--dry-run");

function loadEnvFile(name) {
  const p = resolve(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env.local");

const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("ERROR: Definir SUPABASE_DB_URL_DEMO en .env.local o en la sesión.");
  process.exit(1);
}
if (dbUrl.includes(PROD_REF)) {
  console.error(`ERROR: La URL apunta a PRODUCCIÓN (${PROD_REF}). Abortado.`);
  process.exit(1);
}
if (!dbUrl.includes(DEMO_REF)) {
  console.error(`ERROR: La URL no contiene ref DEMO (${DEMO_REF}). Abortado.`);
  process.exit(1);
}

if (dryRun) {
  console.log("OK dry-run — URL validada como DEMO.");
  process.exit(0);
}

const sql = readFileSync(sqlFile, "utf8");

async function applyWithPg() {
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("\nOK — Estructura DEMO alineada (demo-align-structure-from-prod.sql)\n");
    console.log("Siguiente paso: re-ejecutar audit-supabase-inventory.sql en DEMO y comparar.\n");
  } finally {
    await client.end();
  }
}

const psql = spawnSync("where", ["psql"], { shell: true, encoding: "utf8" });
const hasPsql = psql.status === 0;

if (hasPsql) {
  const r = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", sqlFile], {
    stdio: "inherit",
    env: process.env,
  });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
  console.log("\nOK — aplicado vía psql\n");
} else {
  console.log("psql no encontrado — aplicando con node pg...\n");
  applyWithPg().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
