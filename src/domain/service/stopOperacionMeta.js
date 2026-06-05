/** Metadatos operativos embebidos al final de `stops.notas` (sin columnas nuevas). */

const MARK = "\n\n__CUADERNO_OP__:";

/**
 * Texto visible para el conductor (sin payload JSON).
 */
export function stripOperacionMetaDisplay(notas) {
  if (notas == null || String(notas) === "") return "";
  const s = String(notas);
  const i = s.indexOf(MARK);
  if (i === -1) return s.trim();
  return s.slice(0, i).trim();
}

export function getStopOperacionMeta(notas) {
  if (notas == null || String(notas) === "") return {};
  const s = String(notas);
  const i = s.indexOf(MARK);
  if (i === -1) return {};
  try {
    const raw = s.slice(i + MARK.length).trim();
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/**
 * Fusiona metadatos (p. ej. inicio_operacion_at ISO) preservando el texto libre previo.
 */
export function mergeStopOperacionMeta(notas, patch) {
  const base = stripOperacionMetaDisplay(notas);
  const prev = getStopOperacionMeta(notas);
  const next = { ...prev, ...patch };
  return base + MARK + JSON.stringify(next);
}

export function getInicioOperacionMs(stop) {
  const iso = getStopOperacionMeta(stop?.notas)?.inicio_operacion_at;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

const META_SKIP_KEYS = new Set([
  "inicio_operacion_at",
  "entrada_geo",
  "salida_geo",
  "pais",
  "codigo_postal",
  "provincia",
  "geo_lat",
  "geo_lon",
  "empresa_logistica",
]);

const META_LABELS = {
  empresa_logistica: "Empresa logística",
  empresa: "Empresa",
  observaciones: "Observaciones",
  nota: "Nota",
};

function tryParseJsonObject(raw) {
  const t = String(raw || "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

function readableFromOperacionMeta(meta) {
  if (!meta || typeof meta !== "object") return "";
  const parts = [];
  for (const [key, value] of Object.entries(meta)) {
    if (META_SKIP_KEYS.has(key) || value == null || value === "") continue;
    if (typeof value === "object") continue;
    const text = String(value).trim();
    if (!text) continue;
    const label = META_LABELS[key];
    parts.push(label ? `${label}: ${text}` : text);
  }
  return parts.join(" · ");
}

/**
 * Texto legible para UI/PDF (sin JSON crudo ni metadatos operativos).
 */
export function formatStopNotesForDisplay(notas) {
  if (notas == null || String(notas) === "") return "";
  const visible = stripOperacionMetaDisplay(notas);
  if (visible) {
    const asJson = tryParseJsonObject(visible);
    if (asJson) return readableFromOperacionMeta(asJson);
    if (!visible.startsWith("{") && !visible.includes("__CUADERNO_OP__")) return visible;
  }
  return readableFromOperacionMeta(getStopOperacionMeta(notas));
}
