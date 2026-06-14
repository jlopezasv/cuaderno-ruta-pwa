#!/usr/bin/env node
/**
 * DEMO únicamente: DCDT (master_partes_transporte + dcdt_servicio).
 *
 *   set SUPABASE_DB_URL_DEMO=postgresql://postgres.fezacjtbavgdosncxlzw:...@...
 *   npm run deploy:demo:dcdt
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const DEMO_REF = "fezacjtbavgdosncxlzw";
const PROD_REF = "glyexutcypmhkndvmcxd";
const migrations = [
  resolve(root, "supabase/migrations/20260709120000_dcdt_master_partes.sql"),
  resolve(root, "supabase/migrations/20260710120000_dcdt_rename_from_carta_porte.sql"),
  resolve(root, "supabase/migrations/20260710130000_fix_dcdt_rls_function_volatility.sql"),
];
const verify = resolve(root, "scripts/verify-dcdt-demo.sql");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnvLocal();
const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("ERROR: Definir SUPABASE_DB_URL_DEMO\nProyecto DEMO: " + DEMO_REF);
  process.exit(1);
}
if (dbUrl.includes(PROD_REF)) {
  console.error(`ERROR: URL apunta a PRODUCCIÓN (${PROD_REF}). Abortado.`);
  process.exit(1);
}

for (const migration of migrations) {
  console.log("Aplicando:", migration);
  const apply = spawnSync("node", ["scripts/apply-sql-file.mjs", migration], {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, SUPABASE_DB_URL: dbUrl, SUPABASE_DB_URL_DEMO: dbUrl },
  });
  if ((apply.status ?? 1) !== 0) process.exit(apply.status ?? 1);
}

const check = spawnSync("node", ["scripts/apply-sql-file.mjs", verify], {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, SUPABASE_DB_URL: dbUrl, SUPABASE_DB_URL_DEMO: dbUrl },
});
if ((check.status ?? 1) !== 0) process.exit(check.status ?? 1);

console.log("\nOK — DCDT aplicado solo en DEMO.");
console.log("Checklist: docs/DCDT_DEMO_CHECKLIST.md\n");
