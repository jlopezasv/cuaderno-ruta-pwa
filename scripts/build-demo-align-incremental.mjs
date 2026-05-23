#!/usr/bin/env node
/** Genera scripts/demo-align-incremental.sql desde supabase/migrations (idempotente). */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = join(__dirname, "..", "supabase", "migrations");
const OUT = join(__dirname, "demo-align-incremental.sql");

const SKIP_PATTERNS = [
  /^\s*DELETE\s+FROM/i,
  /^\s*TRUNCATE/i,
  /^\s*DROP\s+TABLE/i,
];

const files = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const header = `-- =============================================================================
-- DEMO ← REAL: alineación esquema (generado desde supabase/migrations)
-- Seguro para datos existentes: sin DELETE, TRUNCATE ni DROP TABLE.
-- Regenerar: node scripts/build-demo-align-incremental.mjs
--
-- Orden (${files.length} migraciones):
${files.map((f) => `--   ${f}`).join("\n")}
-- =============================================================================

`;

let body = "";
for (const f of files) {
  const raw = readFileSync(join(MIG_DIR, f), "utf8");
  const lines = raw.split("\n");
  const filtered = lines.filter((line) => !SKIP_PATTERNS.some((re) => re.test(line)));
  body += `\n-- >>> ${f}\n\n${filtered.join("\n").trim()}\n\n`;
}

writeFileSync(OUT, header + body, "utf8");
console.log(`Escrito ${OUT} (${files.length} archivos)`);
