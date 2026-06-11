#!/usr/bin/env node
/**
 * Crea jlopezasv@gmail.com en Auth DEMO (UID prod) para Panel Propietario.
 * Bloquea si la URL apunta a producción (glyexutcypmhkndvmcxd).
 *
 * Uso:
 *   set SUPABASE_DB_URL_DEMO=postgresql://postgres.fezacjtbavgdosncxlzw:...
 *   node scripts/apply-demo-superadmin-jlopez.mjs
 *
 * Sin connection string: pegar scripts/seed-demo-superadmin-jlopez.sql en SQL Editor Demo.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROD_REF = "glyexutcypmhkndvmcxd";
const DEMO_REF = "fezacjtbavgdosncxlzw";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL = resolve(__dirname, "seed-demo-superadmin-jlopez.sql");

const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("Sin SUPABASE_DB_URL_DEMO.");
  console.error(`Ejecuta manualmente en Supabase DEMO (${DEMO_REF}) → SQL Editor:`);
  console.error("  scripts/seed-demo-superadmin-jlopez.sql");
  console.error("\nLogin demo: jlopezasv@gmail.com / DemoCuaderno2026!");
  process.exit(1);
}

if (dbUrl.includes(PROD_REF)) {
  console.error(`ERROR: URL apunta a PRODUCCIÓN (${PROD_REF}). Abortado.`);
  process.exit(1);
}

console.log("=== Superadmin DEMO (jlopezasv) ===");
console.log("Destino: proyecto demo (no prod)");

const r = spawnSync("node", ["scripts/apply-sql-file.mjs", SQL], {
  stdio: "inherit",
  env: { ...process.env, SUPABASE_DB_URL_DEMO: dbUrl },
  shell: true,
});

if ((r.status ?? 1) === 0) {
  console.log("\nOK — Login: jlopezasv@gmail.com / DemoCuaderno2026!");
  console.log("URL: https://cuaderno-demo-ab.vercel.app");
}
process.exit(r.status ?? 1);
