#!/usr/bin/env node
/**
 * Compara inventarios REAL vs DEMO (JSON de audit-supabase-inventory.sql).
 *
 * Uso:
 *   node scripts/compare-supabase-inventory.mjs inventory/real.json inventory/demo.json
 *   node scripts/compare-supabase-inventory.mjs inventory/real.json inventory/demo.json -o inventory/demo-gap-fill.sql
 *
 * Variables opcionales (export directo vía psql):
 *   SUPABASE_DB_URL_REAL, SUPABASE_DB_URL_DEMO
 *   node scripts/compare-supabase-inventory.mjs --export
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const AUDIT_SQL = join(__dirname, "audit-supabase-inventory.sql");
const ALIGN_SQL = join(__dirname, "demo-align-incremental.sql");

const UDT_TO_SQL = {
  uuid: "uuid",
  text: "text",
  bool: "boolean",
  int2: "smallint",
  int4: "integer",
  int8: "bigint",
  float4: "real",
  float8: "double precision",
  json: "json",
  jsonb: "jsonb",
  timestamptz: "timestamptz",
  timestamp: "timestamp",
  date: "date",
  numeric: "numeric",
  bytea: "bytea",
  _text: "text[]",
  _uuid: "uuid[]",
};

/** Tablas creadas por migraciones del repo (no borra datos). */
const CANONICAL_TABLE_DDL = {
  servicio_documentos_extra: `
CREATE TABLE IF NOT EXISTS public.servicio_documentos_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descripcion text,
  url text,
  archivo_nombre text,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servicio_documentos_extra_servicio
  ON public.servicio_documentos_extra (servicio_id);`,
  documentacion_envios: `
CREATE TABLE IF NOT EXISTS public.documentacion_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  destinatarios text NOT NULL,
  asunto text NOT NULL,
  mensaje text,
  adjuntos jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado text NOT NULL DEFAULT 'enviado',
  error_detalle text,
  enviado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documentacion_envios_servicio
  ON public.documentacion_envios (servicio_id);`,
  servicio_asignaciones: `
CREATE TABLE IF NOT EXISTS public.servicio_asignaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES public.servicios (id) ON DELETE CASCADE,
  stop_id uuid REFERENCES public.stops (id) ON DELETE SET NULL,
  conductor_id uuid NOT NULL,
  tipo_asignacion text NOT NULL DEFAULT 'principal',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servicio_asignaciones_servicio
  ON public.servicio_asignaciones (servicio_id);
CREATE INDEX IF NOT EXISTS idx_servicio_asignaciones_stop
  ON public.servicio_asignaciones (stop_id)
  WHERE stop_id IS NOT NULL;`,
};

const CANONICAL_BUCKETS = [
  { name: "user-photos", public: false },
  { name: "cmr", public: false },
];

const CANONICAL_COLUMNS = [
  { table: "documentacion_envios", column: "empresa_id", sql: "uuid REFERENCES public.empresas (id) ON DELETE SET NULL" },
  { table: "profiles", column: "is_archived", sql: "boolean NOT NULL DEFAULT false" },
  { table: "empresas", column: "codigo_equipo", sql: "text" },
  { table: "ubicaciones", column: "empresa_id", sql: "uuid REFERENCES public.empresas (id) ON DELETE SET NULL" },
  { table: "ubicaciones", column: "servicio_id", sql: "uuid REFERENCES public.servicios (id) ON DELETE SET NULL" },
  { table: "ubicaciones", column: "stop_id", sql: "uuid REFERENCES public.stops (id) ON DELETE SET NULL" },
  { table: "ubicaciones", column: "event_type", sql: "text" },
  { table: "servicio_documentos_extra", column: "stop_id", sql: "uuid REFERENCES public.stops (id) ON DELETE SET NULL" },
  { table: "servicio_documentos_extra", column: "empresa_id", sql: "uuid REFERENCES public.empresas (id) ON DELETE SET NULL" },
  { table: "servicio_documentos_extra", column: "conductor_id", sql: "uuid" },
  { table: "servicio_documentos_extra", column: "archivo_url", sql: "text" },
  { table: "servicio_documentos_extra", column: "mime_type", sql: "text" },
  { table: "servicio_documentos_extra", column: "size_bytes", sql: "bigint" },
  { table: "servicio_documentos_extra", column: "datos", sql: "jsonb DEFAULT '{}'::jsonb" },
];

function parseInventory(raw) {
  let data = JSON.parse(raw);
  if (data.inventory) data = data.inventory;
  if (typeof data === "string") data = JSON.parse(data);
  const tables = new Set(
    Array.isArray(data.tables) ? data.tables : data.tables?.map?.((t) => t) ?? []
  );
  const colKey = (c) => `${c.table}.${c.column}`;
  const columns = new Map();
  for (const c of data.columns ?? []) {
    columns.set(colKey(c), c);
  }
  const buckets = new Set((data.buckets ?? []).map((b) => b.name));
  const policyKey = (p) => `${p.schema}.${p.table}.${p.name}`;
  const policies = new Map();
  for (const p of data.policies ?? []) policies.set(policyKey(p), p);
  const triggerKey = (t) => `${t.schema}.${t.table}.${t.name}`;
  const triggers = new Map();
  for (const t of data.triggers ?? []) triggers.set(triggerKey(t), t);
  const fnKey = (f) => `${f.schema}.${f.name}(${f.args || ""})`;
  const functions = new Map();
  for (const f of data.functions ?? []) functions.set(fnKey(f), f);
  return { meta: data, tables, columns, buckets, policies, triggers, functions };
}

function udtToSql(col) {
  const udt = col.udt || col.data_type;
  if (UDT_TO_SQL[udt]) return UDT_TO_SQL[udt];
  if (col.data_type === "USER-DEFINED") return udt;
  return col.data_type || "text";
}

function columnAlterSql(col) {
  const type = udtToSql(col);
  let line = `ALTER TABLE public.${col.table} ADD COLUMN IF NOT EXISTS ${col.column} ${type}`;
  if (col.nullable === false) line += " NOT NULL";
  if (col.default != null && col.default !== "") {
    line += ` DEFAULT ${col.default}`;
  }
  return line + ";";
}

function diffInventories(real, demo) {
  const missingTables = [...real.tables].filter((t) => !demo.tables.has(t)).sort();
  const extraInDemoTables = [...demo.tables].filter((t) => !real.tables.has(t)).sort();

  const missingColumns = [];
  for (const [key, col] of real.columns) {
    if (!demo.columns.has(key)) missingColumns.push(col);
  }
  missingColumns.sort((a, b) => colKey(a).localeCompare(colKey(b)));

  const missingBuckets = [...real.buckets].filter((b) => !demo.buckets.has(b));
  const missingPolicies = [];
  for (const [key, pol] of real.policies) {
    if (!demo.policies.has(key)) missingPolicies.push(pol);
  }
  missingPolicies.sort((a, b) => policyKey(a).localeCompare(policyKey(b)));

  const missingTriggers = [];
  for (const [key, tr] of real.triggers) {
    if (!demo.triggers.has(key)) missingTriggers.push(tr);
  }
  missingTriggers.sort((a, b) => triggerKey(a).localeCompare(triggerKey(b)));

  const missingFunctions = [];
  for (const [key, fn] of real.functions) {
    if (!demo.functions.has(key)) missingFunctions.push(fn);
  }
  missingFunctions.sort((a, b) => fnKey(a).localeCompare(fnKey(b)));

  const policyDrift = [];
  for (const [key, realPol] of real.policies) {
    const demoPol = demo.policies.get(key);
    if (!demoPol) continue;
    const rq = `${realPol.qual || ""}|${realPol.with_check || ""}`;
    const dq = `${demoPol.qual || ""}|${demoPol.with_check || ""}`;
    if (rq !== dq) policyDrift.push({ key, realPol, demoPol });
  }

  return {
    missingTables,
    extraInDemoTables,
    missingColumns,
    missingBuckets,
    missingPolicies,
    missingTriggers,
    missingFunctions,
    policyDrift,
  };
}

const colKey = (c) => `${c.table}.${c.column}`;
const policyKey = (p) => `${p.schema}.${p.table}.${p.name}`;
const triggerKey = (t) => `${t.schema}.${t.table}.${t.name}`;
const fnKey = (f) => `${f.schema}.${f.name}(${f.args || ""})`;

function buildGapFillSql(diff, real) {
  const lines = [];
  lines.push("-- =============================================================================");
  lines.push("-- DEMO gap-fill (generado automáticamente — NO borra filas existentes)");
  lines.push(`-- Generado: ${new Date().toISOString()}`);
  lines.push("-- Aplica en proyecto DEMO. Luego, si faltan políticas/funciones/triggers,");
  lines.push(`-- ejecuta también: scripts/demo-align-incremental.sql`);
  lines.push("-- =============================================================================\n");

  if (diff.missingTables.length) {
    lines.push("-- --- Tablas faltantes ---");
    for (const t of diff.missingTables) {
      const ddl = CANONICAL_TABLE_DDL[t];
      if (ddl) {
        lines.push(`-- Tabla: ${t}`);
        lines.push(ddl.trim());
        lines.push("");
      } else {
        lines.push(`-- TABLA ${t}: sin DDL en el manifest. Crear manualmente desde REAL o Dashboard.`);
      }
    }
  }

  if (diff.missingColumns.length) {
    lines.push("-- --- Columnas faltantes (tipos desde REAL) ---");
    for (const col of diff.missingColumns) {
      lines.push(`-- ${col.table}.${col.column}`);
      lines.push(columnAlterSql(col));
    }
    lines.push("");
  }

  for (const cc of CANONICAL_COLUMNS) {
    const key = `${cc.table}.${cc.column}`;
    if (real.columns.has(key) && !diff.missingColumns.some((c) => colKey(c) === key)) {
      /* ya existe en demo según diff */
    }
  }

  if (diff.missingBuckets.length) {
    lines.push("-- --- Storage buckets ---");
    for (const name of diff.missingBuckets) {
      const b = CANONICAL_BUCKETS.find((x) => x.name === name) || { name, public: false };
      lines.push(`INSERT INTO storage.buckets (id, name, public)`);
      lines.push(`VALUES ('${b.name}', '${b.name}', ${b.public})`);
      lines.push(`ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;`);
      lines.push("");
    }
  }

  const needsAlign =
    diff.missingPolicies.length > 0 ||
    diff.missingTriggers.length > 0 ||
    diff.missingFunctions.length > 0 ||
    diff.policyDrift.length > 0;

  if (needsAlign) {
    lines.push("-- --- Políticas RLS / triggers / funciones ---");
    lines.push("-- Los siguientes objetos existen en REAL pero no en DEMO (o difieren):");
    for (const p of diff.missingPolicies) {
      lines.push(`--   POLICY ${policyKey(p)}`);
    }
    for (const t of diff.missingTriggers) {
      lines.push(`--   TRIGGER ${triggerKey(t)} → ${t.function}`);
    }
    for (const f of diff.missingFunctions) {
      lines.push(`--   FUNCTION ${fnKey(f)}`);
    }
    for (const d of diff.policyDrift) {
      lines.push(`--   DRIFT POLICY ${d.key} (misma nombre, distinta expresión)`);
    }
    lines.push("--");
    lines.push("-- Ejecuta el bundle idempotente del repo (recomendado):");
    lines.push(`--   ${ALIGN_SQL.replace(/\\/g, "/")}`);
    lines.push("");
  }

  if (
    !diff.missingTables.length &&
    !diff.missingColumns.length &&
    !diff.missingBuckets.length &&
    !needsAlign
  ) {
    lines.push("-- Sin diferencias estructurales detectadas entre REAL y DEMO.");
  }

  return lines.join("\n");
}

function buildReport(diff, realMeta, demoMeta) {
  const sec = (title, items, fmt = (x) => String(x)) => {
    if (!items.length) return `### ${title}\n\n_Ninguno._\n`;
    return `### ${title}\n\n${items.map((x) => `- ${fmt(x)}`).join("\n")}\n`;
  };
  return `# Comparación Supabase REAL vs DEMO

- **REAL:** ${realMeta?.database || "?"} (${realMeta?.exported_at || "?"})
- **DEMO:** ${demoMeta?.database || "?"} (${demoMeta?.exported_at || "?"})

${sec("Tablas faltantes en DEMO", diff.missingTables)}
${sec("Tablas solo en DEMO (no en REAL)", diff.extraInDemoTables)}
${sec("Columnas faltantes en DEMO", diff.missingColumns, (c) => `\`${colKey(c)}\` (${udtToSql(c)})`)}
${sec("Buckets faltantes en DEMO", diff.missingBuckets)}
${sec("Policies RLS faltantes en DEMO", diff.missingPolicies, policyKey)}
${sec("Triggers faltantes en DEMO", diff.missingTriggers, (t) => `${triggerKey(t)} → ${t.function}`)}
${sec("Funciones SQL faltantes en DEMO", diff.missingFunctions, fnKey)}
${sec("Policies con mismo nombre pero distinta expresión", diff.policyDrift, (d) => d.key)}
`;
}

function exportViaPsql(url, outPath) {
  const sql = readFileSync(AUDIT_SQL, "utf8");
  const wrapped = `SELECT inventory::text FROM (${sql.replace(/;\s*$/, "")}) q`;
  const r = spawnSync("psql", [url, "-t", "-A", "-c", wrapped], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`psql falló (${r.status})`);
  }
  const json = r.stdout.trim();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json, "utf8");
  console.log(`Exportado: ${outPath}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--export")) {
    const realUrl = process.env.SUPABASE_DB_URL_REAL;
    const demoUrl = process.env.SUPABASE_DB_URL_DEMO;
    if (!realUrl || !demoUrl) {
      console.error("Define SUPABASE_DB_URL_REAL y SUPABASE_DB_URL_DEMO (postgres://...)");
      process.exit(1);
    }
    const invDir = join(ROOT, "inventory");
    exportViaPsql(realUrl, join(invDir, "real.json"));
    exportViaPsql(demoUrl, join(invDir, "demo.json"));
    args.length = 0;
    args.push(join(invDir, "real.json"), join(invDir, "demo.json"));
  }

  let outSql = join(ROOT, "inventory", "demo-gap-fill.sql");
  let outMd = join(ROOT, "inventory", "gap-report.md");
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" && args[i + 1]) {
      outSql = resolve(args[++i]);
      outMd = outSql.replace(/\.sql$/i, "") + "-report.md";
    } else if (!args[i].startsWith("-")) {
      paths.push(resolve(args[i]));
    }
  }

  if (paths.length < 2) {
    console.log(`Uso:
  node scripts/compare-supabase-inventory.mjs <real.json> <demo.json> [-o gap-fill.sql]
  node scripts/compare-supabase-inventory.mjs --export

Pasos manuales:
  1. Ejecutar scripts/audit-supabase-inventory.sql en REAL y DEMO
  2. Guardar el JSON resultante en inventory/real.json e inventory/demo.json
`);
    process.exit(1);
  }

  const realRaw = readFileSync(paths[0], "utf8");
  const demoRaw = readFileSync(paths[1], "utf8");
  const real = parseInventory(realRaw);
  const demo = parseInventory(demoRaw);
  const diff = diffInventories(real, demo);
  const report = buildReport(diff, real.meta, demo.meta);
  const sql = buildGapFillSql(diff, real);

  mkdirSync(dirname(outSql), { recursive: true });
  writeFileSync(outMd, report, "utf8");
  writeFileSync(outSql, sql, "utf8");

  console.log(report);
  console.log(`\nEscrito: ${outMd}`);
  console.log(`Escrito: ${outSql}`);
  if (diff.missingPolicies.length || diff.missingFunctions.length || diff.missingTriggers.length) {
    console.log(`\nSiguiente paso: ejecutar en DEMO → ${ALIGN_SQL}`);
  }
}

main();
