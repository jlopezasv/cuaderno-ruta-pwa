#!/usr/bin/env node
/**
 * Deploy DEMO: marco archivo/limpieza (retention_framework) + frontend Vercel cuaderno-demo-ab.
 *
 * Requisitos:
 *   - SUPABASE_DB_URL_DEMO + psql en PATH, O pegar SQL en Dashboard Demo
 *   - vercel login (o VERCEL_TOKEN)
 *
 * Uso:
 *   node scripts/deploy-demo-archivo-limpieza.mjs
 *   node scripts/deploy-demo-archivo-limpieza.mjs --skip-sql
 *   node scripts/deploy-demo-archivo-limpieza.mjs --skip-vercel
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migration = resolve(root, "supabase/migrations/20260708120000_data_retention_framework.sql");
const skipSql = process.argv.includes("--skip-sql");
const skipVercel = process.argv.includes("--skip-vercel");

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: process.platform === "win32", ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!skipSql) {
  const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;
  if (dbUrl) {
    run("node", ["scripts/apply-sql-file.mjs", migration]);
  } else {
    console.warn(
      "\n[WARN] Sin SUPABASE_DB_URL_DEMO — omitiendo SQL.\n" +
        "Ejecuta en Supabase DEMO (fezacjtbavgdosncxlzw) → SQL Editor:\n" +
        "  supabase/migrations/20260708120000_data_retention_framework.sql\n",
    );
  }
}

if (!skipVercel) {
  run("npm", ["run", "build"]);
  const demoProject = process.env.VERCEL_DEMO_PROJECT || process.env.VERCEL_PROJECT || "cuaderno-demo-ab";
  const vercelArgs = ["vercel", "deploy", "--prod", "--yes", "--project", demoProject];
  const r = spawnSync("npx", vercelArgs, {
    stdio: "inherit",
    cwd: root,
    shell: true,
    env: { ...process.env },
  });
  if (r.status !== 0) {
    console.warn(
      "\n[WARN] Vercel deploy falló (¿vercel login?). Si GitHub está enlazado a cuaderno-demo-ab, git push también despliega.\n",
    );
    process.exit(r.status ?? 1);
  }
}

console.log("\nOK — Demo: https://cuaderno-demo-ab.vercel.app");
console.log("Panel propietario → Archivo y limpieza (superadmin).\n");
