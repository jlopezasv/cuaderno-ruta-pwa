#!/usr/bin/env node
/**
 * DEMO: office_user_can_insert_planned_servicio definitivo.
 *
 *   set SUPABASE_DB_URL_DEMO=postgresql://postgres.[ref]:[pass]@...
 *   node scripts/apply-demo-office-planned-insert-definitive.mjs
 *   node scripts/apply-demo-office-planned-insert-definitive.mjs --deploy
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const DEMO_REF = "fezacjtbavgdosncxlzw";
const PROD_REF = "glyexutcypmhkndvmcxd";
const migration = resolve(
  root,
  "supabase/migrations/20260623120000_demo_office_planned_insert_definitive.sql",
);

const deploy = process.argv.includes("--deploy");
const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error(
    "Definir SUPABASE_DB_URL_DEMO.\nO pegar en SQL Editor DEMO:\n" + migration,
  );
  process.exit(1);
}
if (dbUrl.includes(PROD_REF)) {
  console.error(`ERROR: URL apunta a REAL (${PROD_REF}). Abortado.`);
  process.exit(1);
}
if (!dbUrl.includes(DEMO_REF)) {
  console.warn(`[WARN] URL no contiene ref DEMO (${DEMO_REF}). Continúa bajo tu responsabilidad.`);
}

const r = spawnSync("node", ["scripts/apply-sql-file.mjs", migration], {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, SUPABASE_DB_URL: dbUrl },
});
if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);

if (deploy) {
  const vr = spawnSync(
    "npx",
    ["vercel", "deploy", "--prod", "--yes", "--project", "cuaderno-demo-ab"],
    { stdio: "inherit", cwd: root, shell: true, env: process.env },
  );
  if ((vr.status ?? 1) !== 0) process.exit(vr.status ?? 1);
  console.log("\nOK — https://cuaderno-demo-ab.vercel.app\n");
} else {
  console.log("\nOK — SQL DEMO aplicado. Deploy: node scripts/apply-demo-office-planned-insert-definitive.mjs --deploy\n");
}
