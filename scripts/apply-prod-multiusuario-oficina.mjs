#!/usr/bin/env node
/**
 * Aplica multiusuario oficina en REAL (glyexutcypmhkndvmcxd).
 *
 *   set SUPABASE_DB_URL=postgresql://postgres.[ref]:[pass]@...
 *   node scripts/apply-prod-multiusuario-oficina.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const PROD_REF = "glyexutcypmhkndvmcxd";
const DEMO_REF = "fezacjtbavgdosncxlzw";
const migration = resolve(
  root,
  "supabase/migrations/20260617120000_empresa_usuarios_oficina_prod.sql",
);

const dbUrl = process.env.SUPABASE_DB_URL || process.env.SUPABASE_DB_URL_PROD;
if (!dbUrl) {
  console.error("Definir SUPABASE_DB_URL o SUPABASE_DB_URL_PROD (connection string Postgres REAL).");
  process.exit(1);
}
if (dbUrl.includes(DEMO_REF)) {
  console.error(`ERROR: URL apunta a DEMO (${DEMO_REF}). Abortado.`);
  process.exit(1);
}
if (!dbUrl.includes(PROD_REF)) {
  console.warn(`[WARN] URL no contiene ref REAL (${PROD_REF}). Continúa bajo tu responsabilidad.`);
}

const r = spawnSync("node", ["scripts/apply-sql-file.mjs", migration], {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, SUPABASE_DB_URL: dbUrl },
});
process.exit(r.status ?? 1);
