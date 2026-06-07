#!/usr/bin/env node
/**
 * DEMO multiusuario fase 1: responsable_nombre + deploy cuaderno-demo-ab.
 *
 * Uso:
 *   set SUPABASE_DB_URL_DEMO=postgresql://...
 *   node scripts/deploy-demo-multiusuario-fase1.mjs
 *   node scripts/deploy-demo-multiusuario-fase1.mjs --skip-sql
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
  "supabase/migrations/20260616120000_demo_servicios_responsable_nombre.sql",
);
const skipSql = process.argv.includes("--skip-sql");
const skipVercel = process.argv.includes("--skip-vercel");

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: root,
    shell: process.platform === "win32",
    ...opts,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!skipSql) {
  const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.warn(
      "\n[WARN] Sin SUPABASE_DB_URL_DEMO — pegar en SQL Editor DEMO:\n" +
        "  supabase/migrations/20260616120000_demo_servicios_responsable_nombre.sql\n",
    );
  } else if (dbUrl.includes(PROD_REF)) {
    console.error(`ERROR: URL apunta a REAL (${PROD_REF}). Abortado.`);
    process.exit(1);
  } else if (!dbUrl.includes(DEMO_REF)) {
    console.warn(`[WARN] URL no contiene ref DEMO (${DEMO_REF}). Continúa bajo tu responsabilidad.`);
  }
  if (dbUrl) {
    run("node", ["scripts/apply-sql-file.mjs", migration]);
  }
}

if (!skipVercel) {
  run("npm", ["run", "build"]);
  const vercelArgs = ["vercel", "deploy", "--prod", "--yes"];
  const project = process.env.VERCEL_DEMO_PROJECT || process.env.VERCEL_PROJECT || "cuaderno-demo-ab";
  vercelArgs.push("--project", project);
  const r = spawnSync("npx", vercelArgs, {
    stdio: "inherit",
    cwd: root,
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("\nOK — DEMO multiusuario fase 1: https://cuaderno-demo-ab.vercel.app\n");
