#!/usr/bin/env node
/**
 * Release producción REAL: columnas mail + reparación legacy stops/evidencias si aplica.
 *
 * Aplica SOLO:
 *   20260531160000_documentacion_envios_envio_cliente_demo.sql
 *   20260531170000_documentacion_envios_cliente_mail_demo.sql
 *   20260530180000_multi_conductor_stops_rls_repair.sql (si existe stops_acceso)
 *   20260530190000_multi_conductor_evidencias_rls_repair.sql (si existe evidencias_acceso)
 *
 * Uso:
 *   set SUPABASE_DB_URL_REAL=postgresql://postgres.[ref-real]:[pass]@...
 *   node scripts/apply-prod-release-mail.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

function loadEnvFile(name) {
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "..", name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env.prod.apply");

const PROD_REF = "glyexutcypmhkndvmcxd";
const DEMO_REF = "fezacjtbavgdosncxlzw";
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../supabase/migrations");

const dbUrl = process.env.SUPABASE_DB_URL_REAL || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("ERROR: Definir SUPABASE_DB_URL_REAL.");
  process.exit(1);
}
if (dbUrl.includes(DEMO_REF)) {
  console.error(`ERROR: URL apunta a DEMO (${DEMO_REF}). Abortado.`);
  process.exit(1);
}
if (!dbUrl.includes(PROD_REF)) {
  console.error(`ERROR: URL no contiene ref REAL (${PROD_REF}). Abortado.`);
  process.exit(1);
}

function loadSql(name) {
  return readFileSync(resolve(MIGRATIONS_DIR, name), "utf8");
}

async function policyExists(client, table, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = $1 AND policyname = $2`,
    [table, name]
  );
  return rows.length > 0;
}

async function runFile(client, file, label) {
  console.log(`\n=== ${label} ===`);
  await client.query(loadSql(file));
  console.log(`OK: ${file}`);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("=== Pre-check REAL ===");
  console.log("Ref esperado:", PROD_REF);

  const legacyStops = await policyExists(client, "stops", "stops_acceso");
  const legacyEv = await policyExists(client, "evidencias", "evidencias_acceso");
  const hasStpSel = await policyExists(client, "stops", "stp_sel");
  const hasEvSel = await policyExists(client, "evidencias", "ev_sel");

  console.log("stops_acceso (legacy):", legacyStops ? "SÍ" : "NO");
  console.log("evidencias_acceso (legacy):", legacyEv ? "SÍ" : "NO");
  console.log("stp_sel (nueva):", hasStpSel ? "SÍ" : "NO");
  console.log("ev_sel (nueva):", hasEvSel ? "SÍ" : "NO");

  await runFile(client, "20260531160000_documentacion_envios_envio_cliente_demo.sql", "Mail cliente (1/2)");
  await runFile(client, "20260531170000_documentacion_envios_cliente_mail_demo.sql", "Mail cliente (2/2)");

  if (legacyStops || !hasStpSel) {
    await runFile(client, "20260530180000_multi_conductor_stops_rls_repair.sql", "Stops RLS repair");
  } else {
    console.log("\n=== Stops RLS: sin cambios (sin legacy, stp_sel OK) ===");
  }

  if (legacyEv || !hasEvSel) {
    await runFile(client, "20260530190000_multi_conductor_evidencias_rls_repair.sql", "Evidencias RLS repair");
  } else {
    console.log("\n=== Evidencias RLS: sin cambios (sin legacy, ev_sel OK) ===");
  }

  const postLegacyStops = await policyExists(client, "stops", "stops_acceso");
  const postLegacyEv = await policyExists(client, "evidencias", "evidencias_acceso");
  if (postLegacyStops || postLegacyEv) {
    throw new Error("Siguen existiendo policies legacy tras repair");
  }

  console.log("\n=== OK — release SQL aplicado en REAL ===");
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
