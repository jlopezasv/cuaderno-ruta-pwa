#!/usr/bin/env node
/**
 * DEMO: RLS INSERT servicios para usuarios oficina (planificado sin conductor).
 *
 *   set SUPABASE_DB_URL_DEMO=postgresql://postgres.[ref]:[pass]@...
 *   node scripts/apply-demo-office-insert-servicio-rls.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const DEMO_REF = "fezacjtbavgdosncxlzw";
const PROD_REF = "glyexutcypmhkndvmcxd";
const migrationV5 = resolve(
  root,
  "supabase/migrations/20260622120000_demo_office_planned_servicio_insert_fix.sql",
);
const migrationV4 = resolve(
  root,
  "supabase/migrations/20260621120000_demo_office_insert_servicio_rls_v4_policy.sql",
);
const migrationV3 = resolve(
  root,
  "supabase/migrations/20260620120000_demo_office_insert_servicio_rls_v3_volatile.sql",
);
const migrationV2 = resolve(
  root,
  "supabase/migrations/20260619120000_demo_office_insert_servicio_rls_v2.sql",
);
const migrationV1 = resolve(
  root,
  "supabase/migrations/20260618120000_demo_office_user_insert_servicio_rls.sql",
);
const migration = migrationV5;

const dbUrl = process.env.SUPABASE_DB_URL_DEMO || process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(
    "Definir SUPABASE_DB_URL_DEMO.\n" +
      "O pegar en SQL Editor DEMO:\n" +
      `${migration}\n(v4: ${migrationV4}, v3: ${migrationV3}, v2: ${migrationV2}, v1: ${migrationV1})`,
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
process.exit(r.status ?? 1);
