#!/usr/bin/env node
/**
 * Exporta inventario Supabase → inventory/real.json y inventory/demo.json
 *
 * Requiere en .env.local (raíz del proyecto):
 *   SUPABASE_DB_URL_REAL=postgresql://postgres.glyexutcypmhkndvmcxd:...
 *   SUPABASE_DB_URL_DEMO=postgresql://postgres.fezacjtbavgdosncxlzw:...
 *
 * Uso:
 *   node scripts/export-supabase-inventory.mjs
 *   node scripts/export-supabase-inventory.mjs --compare
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const INV_DIR = join(ROOT, "inventory");
const AUDIT_SQL = join(__dirname, "audit-supabase-inventory.sql");
const PROD_REF = "glyexutcypmhkndvmcxd";
const DEMO_REF = "fezacjtbavgdosncxlzw";
const doCompare = process.argv.includes("--compare");

function loadEnvFile(name) {
  const p = resolve(ROOT, name);
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

function validateUrl(url, label, mustContain) {
  if (!url) {
    console.error(`\nFalta ${label} en .env.local\n`);
    console.error(`Añade en: ${join(ROOT, ".env.local")}`);
    console.error(`${label}=postgresql://postgres.${mustContain}:TU_PASSWORD@...\n`);
    process.exit(1);
  }
  if (!url.includes(mustContain)) {
    console.error(`\n${label} no apunta a ${mustContain}. Revisa .env.local\n`);
    process.exit(1);
  }
}

const realUrl = process.env.SUPABASE_DB_URL_REAL || process.env.SUPABASE_DB_URL_PROD;
const demoUrl = process.env.SUPABASE_DB_URL_DEMO;

validateUrl(realUrl, "SUPABASE_DB_URL_REAL", PROD_REF);
validateUrl(demoUrl, "SUPABASE_DB_URL_DEMO", DEMO_REF);

const auditBody = readFileSync(AUDIT_SQL, "utf8").replace(/;\s*$/, "");

async function exportOne(label, url, outFile) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT inventory FROM (${auditBody}) q`);
    let inv = rows[0]?.inventory;
    if (typeof inv === "string") inv = JSON.parse(inv);
    const json = JSON.stringify(inv, null, 2);
    writeFileSync(outFile, json, "utf8");
    console.log(`✓ ${label} → ${outFile}`);
    return inv;
  } finally {
    await client.end();
  }
}

async function main() {
  mkdirSync(INV_DIR, { recursive: true });
  const realPath = join(INV_DIR, "real.json");
  const demoPath = join(INV_DIR, "demo.json");

  console.log("\nExportando inventario Supabase...\n");
  await exportOne("PRODUCCIÓN", realUrl, realPath);
  await exportOne("DEMO", demoUrl, demoPath);

  console.log("\nArchivos creados:");
  console.log(`  ${realPath}`);
  console.log(`  ${demoPath}`);

  if (doCompare) {
    console.log("\nGenerando informe comparativo...\n");
    const r = spawnSync("node", ["scripts/compare-supabase-inventory.mjs", realPath, demoPath], {
      cwd: ROOT,
      stdio: "inherit",
      encoding: "utf8",
    });
    process.exit(r.status ?? 0);
  } else {
    console.log("\nSiguiente paso:");
    console.log("  node scripts/export-supabase-inventory.mjs --compare");
    console.log("  (o: node scripts/compare-supabase-inventory.mjs inventory/real.json inventory/demo.json)\n");
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
