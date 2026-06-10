#!/usr/bin/env node
/**
 * Aplica migración agenda comercial super_admin en Supabase PRODUCCIÓN (+ deploy opcional).
 * Uso: node scripts/apply-admin-agenda-comercial-prod.mjs [--deploy]
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migration = resolve(root, "supabase/migrations/20260706120000_admin_agenda_comercial.sql");
const deploy = process.argv.includes("--deploy");

const dbUrl = process.env.SUPABASE_DB_URL_REAL || process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Falta SUPABASE_DB_URL_REAL");
  process.exit(1);
}

const r = spawnSync("node", ["scripts/apply-sql-file.mjs", migration], {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, SUPABASE_DB_URL: dbUrl },
});
if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);

if (deploy) {
  const vr = spawnSync("npx", ["vercel", "deploy", "--prod", "--yes"], {
    stdio: "inherit",
    cwd: root,
    shell: true,
  });
  if ((vr.status ?? 1) !== 0) process.exit(vr.status ?? 1);
  console.log("\nOK — producción desplegada\n");
} else {
  console.log(
    "\nOK — SQL admin agenda comercial aplicado. Deploy: node scripts/apply-admin-agenda-comercial-prod.mjs --deploy\n",
  );
}
