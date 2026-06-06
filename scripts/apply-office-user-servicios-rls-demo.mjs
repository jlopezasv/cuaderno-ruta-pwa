#!/usr/bin/env node
/**
 * Aplica RLS oficina → servicios en Supabase DEMO.
 *
 *   set SUPABASE_DB_URL_DEMO=postgresql://...
 *   node scripts/apply-office-user-servicios-rls-demo.mjs
 *
 * Sin DB URL: imprime ruta del SQL para pegarlo en SQL Editor (proyecto DEMO).
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migration = resolve(
  root,
  "supabase/migrations/20260608120000_office_user_servicios_rls_demo.sql",
);

const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.warn(
    "\n[WARN] Sin SUPABASE_DB_URL_DEMO.\n" +
      "Pega en Supabase DEMO → SQL Editor:\n" +
      `  ${migration}\n`,
  );
  process.exit(0);
}

const r = spawnSync("node", ["scripts/apply-sql-file.mjs", migration], {
  stdio: "inherit",
  cwd: root,
  shell: true,
});
process.exit(r.status ?? 1);
