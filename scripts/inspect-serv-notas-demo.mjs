#!/usr/bin/env node
/**
 * Lee stops.notas de un servicio en demo vía REST (anon key del bundle desplegado).
 * Uso: node scripts/inspect-serv-notas-demo.mjs SERV-896
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const serviceRef = process.argv[2] || "SERV-896";

function loadEnvFile(name) {
  try {
    const raw = readFileSync(resolve(root, name), "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      out[m[1]] = m[2].replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

async function extractSupabaseFromDemoBundle() {
  const html = await fetch("https://cuaderno-demo-ab.vercel.app/index.html").then((r) => r.text());
  const entry = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  const toFetch = new Set();
  if (entry) toFetch.add(entry);
  for (const m of html.matchAll(/href="(\/assets\/[^"]+\.js)"/g)) toFetch.add(m[1]);

  if (entry) {
    const entryJs = await fetch(`https://cuaderno-demo-ab.vercel.app${entry}`).then((r) => r.text());
    for (const m of entryJs.matchAll(/\/assets\/[A-Za-z0-9_.-]+\.js/g)) toFetch.add(m[0]);
  }

  for (const path of toFetch) {
    const js = await fetch(`https://cuaderno-demo-ab.vercel.app${path}`).then((r) => r.text()).catch(() => "");
    const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
    const key = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
    if (url && key) return { url, key, bundle: path };
  }
  return null;
}

function visualize(s) {
  return JSON.stringify(String(s ?? ""));
}

function hexAroundMark(s, mark) {
  const i = s.indexOf(mark);
  if (i < 0) return null;
  const start = Math.max(0, i - 8);
  const end = Math.min(s.length, i + mark.length + 8);
  const slice = s.slice(start, end);
  const bytes = [...slice].map((ch) => {
    const code = ch.charCodeAt(0);
    if (ch === "\n") return "\\n";
    if (ch === "\r") return "\\r";
    if (ch === "\t") return "\\t";
    if (code < 32 || code > 126) return `\\u${code.toString(16).padStart(4, "0")}`;
    return ch;
  });
  return { index: i, context: bytes.join("") };
}

function parserStrictOld(s) {
  const MARK = "\n\n__CUADERNO_OP__:";
  const i = s.indexOf(MARK);
  return { found: i !== -1, index: i, mark: MARK, markLen: MARK.length };
}

function parserStrictWrite(s) {
  const MARK = "\n\n__CUADERNO_OP__:";
  const BARE = "__CUADERNO_OP__:";
  const i = s.indexOf(MARK);
  if (i !== -1) return { found: true, variant: "double-newline", index: i, mark: MARK };
  const j = s.indexOf(BARE);
  return { found: j !== -1, variant: j === 0 ? "bare-start" : "bare-after-text", index: j, mark: BARE };
}

async function sbFetch(base, key, path) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

async function main() {
  const envLocal = loadEnvFile(".env.local");
  const envVercel = loadEnvFile(".env.vercel.pull");
  let url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || envLocal.VITE_SUPABASE_URL;
  let key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    envLocal.VITE_SUPABASE_ANON_KEY ||
    envVercel.VITE_SUPABASE_ANON_KEY ||
    envVercel.SUPABASE_SERVICE_ROLE_KEY;
  let source = "env";

  if (!url || !key) {
    const fromBundle = await extractSupabaseFromDemoBundle();
    if (!fromBundle) {
      console.error("No se pudo obtener Supabase URL/key (env ni bundle demo).");
      process.exit(1);
    }
    url = fromBundle.url;
    key = fromBundle.key;
    source = `demo bundle ${fromBundle.bundle}`;
  }

  console.log(`Supabase: ${url} (${source})`);
  console.log(`Buscando servicio ref: ${serviceRef}\n`);

  const servicios = await sbFetch(
    url,
    key,
    `servicios?select=id,referencia,origen,destino,estado&order=created_at.desc&limit=500`,
  );

  const hit =
    servicios.find((s) => String(s.referencia || "").startsWith(serviceRef)) ||
    servicios.find((s) => {
      const base = String(s.referencia || "").split("\n")[0].split("__SRV_OP__")[0].trim();
      return base === serviceRef || base.startsWith(`${serviceRef} `);
    });

  if (!hit?.id) {
    console.error("Servicio no encontrado. Muestra de referencias:");
    for (const s of servicios.slice(0, 15)) {
      const base = String(s.referencia || "").split("\n")[0].split("__SRV_OP__")[0].trim();
      console.log(" -", base, s.id);
    }
    process.exit(1);
  }

  console.log(`Servicio: ${hit.id}`);
  console.log(`referencia (primeros 120): ${JSON.stringify(String(hit.referencia || "").slice(0, 120))}\n`);

  const stops = await sbFetch(
    url,
    key,
    `stops?servicio_id=eq.${hit.id}&select=id,orden,tipo,nombre,notas&order=orden.asc`,
  );

  if (!stops.length) {
    console.log("Sin paradas.");
    process.exit(0);
  }

  for (const st of stops) {
    const notas = st.notas ?? "";
    console.log("=".repeat(72));
    console.log(`Stop #${st.orden} ${st.tipo} (${st.nombre}) id=${st.id}`);
    console.log(`Longitud notas: ${notas.length}`);
    console.log(`notas (JSON.stringify — saltos visibles):`);
    console.log(visualize(notas));
    console.log("");

    const variants = ["\n\n__CUADERNO_OP__:", "\n__CUADERNO_OP__:", "__CUADERNO_OP__:"];
    for (const v of variants) {
      const pos = notas.indexOf(v);
      console.log(`  indexOf(${JSON.stringify(v)}): ${pos}`);
      if (pos >= 0) console.log(`    contexto: ${hexAroundMark(notas, v)?.context}`);
    }

    const oldP = parserStrictOld(notas);
    const writeP = parserStrictWrite(notas);
    console.log(`  parser PRE-fix (solo \\n\\n__CUADERNO_OP__:): found=${oldP.found} index=${oldP.index}`);
    console.log(`  formato escritura mergeStopOperacionMeta: ${JSON.stringify(writeP)}`);

    if (notas.includes("__CUADERNO_OP__")) {
      const barePos = notas.indexOf("__CUADERNO_OP__:");
      const before = notas.slice(Math.max(0, barePos - 4), barePos);
      const beforeCodes = [...before].map((c) => c.charCodeAt(0));
      console.log(`  bytes inmediatamente ANTES de __CUADERNO_OP__: ${JSON.stringify(beforeCodes)} (${JSON.stringify(before)})`);
    }
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
