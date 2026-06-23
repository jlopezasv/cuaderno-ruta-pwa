#!/usr/bin/env node
/**
 * Producción REAL: service_messages (si falta) + chat_service_read_receipts.
 * Deploy opcional a tacografo-pro.
 *
 * Uso:
 *   set SUPABASE_DB_URL_REAL=postgresql://postgres.[ref-real]:[pass]@...
 *   node scripts/apply-prod-chat-read-receipts.mjs
 *   node scripts/apply-prod-chat-read-receipts.mjs --deploy
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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
const PROD_VERCEL_PROJECT = process.env.VERCEL_PROD_PROJECT || "tacografo-pro";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const MIGRATIONS_DIR = resolve(root, "supabase/migrations");
const deploy = process.argv.includes("--deploy");

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

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
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

  const hasMessages = await tableExists(client, "service_messages");
  const hasReceipts = await tableExists(client, "chat_service_read_receipts");
  console.log("service_messages:", hasMessages ? "SÍ" : "NO");
  console.log("chat_service_read_receipts:", hasReceipts ? "SÍ" : "NO");

  if (!hasMessages) {
    await runFile(client, "20260711120000_service_messages_demo.sql", "service_messages (prerrequisito)");
  } else {
    console.log("\n=== service_messages: ya existe, omitido ===");
  }

  if (!hasReceipts) {
    await runFile(client, "20260720120000_chat_service_read_receipts.sql", "chat_service_read_receipts");
  } else {
    console.log("\n=== chat_service_read_receipts: ya existe — re-aplicando (idempotente) ===");
    await runFile(client, "20260720120000_chat_service_read_receipts.sql", "chat_service_read_receipts");
  }

  console.log("\n=== OK — SQL chat lectura aplicado en REAL ===");
} catch (err) {
  console.error("ERROR:", err.message);
  if (err.detail) console.error("Detalle:", err.detail);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

if (deploy) {
  console.log(`\n=== Deploy Vercel: ${PROD_VERCEL_PROJECT} ===`);
  const br = spawnSync("npm", ["run", "build"], { stdio: "inherit", cwd: root, shell: true });
  if ((br.status ?? 1) !== 0) process.exit(br.status ?? 1);

  const vr = spawnSync(
    "npx",
    ["vercel", "deploy", "--prod", "--yes", "--project", PROD_VERCEL_PROJECT],
    { stdio: "inherit", cwd: root, shell: true },
  );
  if ((vr.status ?? 1) !== 0) process.exit(vr.status ?? 1);
  console.log("\nOK — https://tacografo-pro.vercel.app\n");
} else {
  console.log(
    `\nDeploy front: node scripts/apply-prod-chat-read-receipts.mjs --deploy\n`,
  );
}
