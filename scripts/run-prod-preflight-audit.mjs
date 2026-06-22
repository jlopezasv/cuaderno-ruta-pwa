#!/usr/bin/env node
/**
 * Ejecuta preflight prod contra SUPABASE_DB_URL_REAL (.env.local).
 * Uso: node scripts/run-prod-preflight-audit.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_REF = "glyexutcypmhkndvmcxd";
const DEMO_REF = "fezacjtbavgdosncxlzw";

function loadEnvFile(name) {
  const p = resolve(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
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
loadEnvFile(".env.prod.apply");

const dbUrl = process.env.SUPABASE_DB_URL_REAL || process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("ERROR: Definir SUPABASE_DB_URL_REAL en .env.local");
  process.exit(1);
}
if (dbUrl.includes(DEMO_REF)) {
  console.error("ERROR: URL apunta a DEMO. Abortado.");
  process.exit(1);
}
if (!dbUrl.includes(PROD_REF)) {
  console.error(`ERROR: URL no contiene ref REAL (${PROD_REF}). Abortado.`);
  process.exit(1);
}

function stripComments(sql) {
  return sql.replace(/--.*$/gm, "");
}

async function runSelectStatements(client, rel) {
  console.log(`\n===== ${rel} =====`);
  const raw = readFileSync(resolve(root, rel), "utf8");
  const parts = stripComments(raw)
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  for (let i = 0; i < parts.length; i++) {
    const sql = parts[i];
    if (!/^select/i.test(sql)) continue;
    try {
      const res = await client.query(sql);
      if (res.rows?.length) {
        console.log(`--- result ${i + 1} (${res.rows.length} rows) ---`);
        const show = res.rows.length > 50 ? res.rows.slice(0, 50) : res.rows;
        console.table(show);
        if (res.rows.length > 50) console.log(`... +${res.rows.length - 50} more`);
      }
    } catch (e) {
      console.error(`ERR stmt ${i + 1}:`, e.message);
    }
  }
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`Conectado a producción REAL (${PROD_REF})`);

  await runSelectStatements(client, "scripts/prod-deca-fase0-inventory.sql");

  const auditSql = readFileSync(resolve(root, "scripts/preflight-prod-sql-audit.sql"), "utf8");
  const auditRes = await client.query(auditSql);
  const pending = auditRes.rows.filter((r) =>
    ["FALTA", "ALERTA", "REVISAR"].includes(r.estado),
  );
  console.log("\n===== preflight-prod-sql-audit.sql =====");
  console.log(`Total checks: ${auditRes.rows.length} | Pendientes: ${pending.length}`);
  console.table(pending);

  const finalSql = readFileSync(resolve(root, "scripts/preflight-prod-final-checklist.sql"), "utf8");
  const finalRes = await client.query(finalSql);
  const finalPending = finalRes.rows.filter((r) => ["FALTA", "ALERTA"].includes(r.estado));
  console.log("\n===== preflight-prod-final-checklist.sql =====");
  console.log(`Total: ${finalRes.rows.length} | Pendientes: ${finalPending.length}`);
  console.table(finalPending);

  const deca = await client.query(`
    SELECT
      to_regclass('public.dcdt_servicio') IS NOT NULL AS tiene_dcdt_servicio,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'conductor_empresa' AND column_name = 'remolque'
      ) AS tiene_remolque_ce,
      EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'user_can_manage_dcdt_trafico'
      ) AS fn_dcdt_trafico,
      EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'is_superadmin_agenda_user'
      ) AS fn_superadmin_agenda,
      EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'user_is_active_office_peer'
      ) AS fn_office_peer
  `);
  console.log("\n===== DeCA / remolque snapshot =====");
  console.table(deca.rows);
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
