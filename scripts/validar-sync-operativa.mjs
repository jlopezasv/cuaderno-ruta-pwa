/**
 * Validación recomendada: política RLS + migración aplicada.
 * - Con SUPABASE_DB_URL o DATABASE_URL (postgres): psql -f scripts/validar-sync-operativa.sql
 * - Con Supabase CLI: npx supabase db query -f ... --linked o --db-url
 * - Si no hay conexión: instrucciones para SQL Editor del Dashboard.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sqlFile = path.join(__dirname, "validar-sync-operativa.sql");

function loadEnvFile(name) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
}

console.log("=== Validación sync operativa (ubicaciones + flota) ===\n");

if (dbUrl) {
  const psql = process.platform === "win32" ? "psql.exe" : "psql";
  const r = run(psql, [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", sqlFile], { stdio: "pipe" });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status === 0) {
    console.log("\nOK: consultas ejecutadas contra SUPABASE_DB_URL / DATABASE_URL.");
    process.exit(0);
  }
  console.warn(
    "\npsql no ejecutó el archivo (¿psql instalado y URL correcta?). Alternativa: SQL Editor en Dashboard.\n",
  );
}

const cliVer = run("npx", ["supabase", "--version"], { stdio: "pipe" });
if (cliVer.status === 0) {
  const exLinked = run(
    "npx",
    ["supabase", "db", "query", "-f", "scripts/validar-sync-operativa.sql", "--linked"],
    { stdio: "pipe" },
  );
  if (exLinked.stdout) process.stdout.write(exLinked.stdout);
  if (exLinked.stderr) process.stderr.write(exLinked.stderr);
  if (exLinked.status === 0) {
    console.log("\nOK: supabase db query --linked completado.");
    process.exit(0);
  }
  if (dbUrl) {
    const exUrl = run(
      "npx",
      ["supabase", "db", "query", "-f", "scripts/validar-sync-operativa.sql", "--db-url", dbUrl],
      { stdio: "pipe" },
    );
    if (exUrl.stdout) process.stdout.write(exUrl.stdout);
    if (exUrl.stderr) process.stderr.write(exUrl.stderr);
    if (exUrl.status === 0) {
      console.log("\nOK: supabase db query --db-url completado.");
      process.exit(0);
    }
  }
  console.warn("\nsupabase db query falló (¿supabase link o SUPABASE_DB_URL correcta?).\n");
}

console.log(`Pasos manuales:

1) Aplicar migración + validar en un solo paso (recomendado):
   Supabase → SQL Editor → ejecutar el archivo:
   scripts/aplicar-y-validar-operativa-dashboard.sql

   (Equivale a la migración supabase/migrations/20260518200000_ubicaciones_select_empresa_flota.sql
   más consultas de comprobación.)

2) Solo checklist (si la migración ya está aplicada):
   ${path.relative(root, sqlFile)}

3) Prueba en la app: conductor en flota con GPS + panel empresa (ubicación / ETA).

Opcional: en .env.local define SUPABASE_DB_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres
       y ejecuta de nuevo: npm run validate:operativa
`);
process.exit(1);
