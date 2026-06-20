/** Metadatos operativos embebidos al final de `stops.notas` (sin columnas nuevas). */

const BARE_MARK = "__CUADERNO_OP__:";
const MARK = `\n\n${BARE_MARK}`;

function findStopMetaMark(notas) {
  if (notas == null || notas === "") return null;
  const s = String(notas);
  const candidates = [
    { index: s.indexOf(MARK), length: MARK.length },
    { index: s.indexOf(`\r\n\r\n${BARE_MARK}`), length: `\r\n\r\n${BARE_MARK}`.length },
    { index: s.indexOf(`\n${BARE_MARK}`), length: `\n${BARE_MARK}`.length },
    { index: s.indexOf(`\r\n${BARE_MARK}`), length: `\r\n${BARE_MARK}`.length },
    { index: s.indexOf(BARE_MARK), length: BARE_MARK.length },
  ].filter((c) => c.index !== -1);
  if (!candidates.length) return null;
  return candidates.reduce((best, cur) => (cur.index < best.index ? cur : best));
}

function parseMetaPayload(raw) {
  try {
    const o = JSON.parse(String(raw || "").trim());
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/**
 * Texto visible para el conductor (sin payload JSON).
 */
export function stripOperacionMetaDisplay(notas) {
  if (notas == null || String(notas) === "") return "";
  if (typeof notas === "object" && !Array.isArray(notas)) return "";
  const s = String(notas);
  const mark = findStopMetaMark(s);
  if (!mark) return s.trim();
  return s.slice(0, mark.index).trim();
}

export function getStopOperacionMeta(notas) {
  if (notas == null || notas === "") return {};
  if (typeof notas === "object" && !Array.isArray(notas)) {
    return { ...notas };
  }
  const s = String(notas);
  const mark = findStopMetaMark(s);
  if (!mark) {
    return parseMetaPayload(s);
  }
  return parseMetaPayload(s.slice(mark.index + mark.length));
}

/**
 * Fusiona metadatos (p. ej. inicio_operacion_at ISO) preservando el texto libre previo.
 */
export function mergeStopOperacionMeta(notas, patch) {
  const base = stripOperacionMetaDisplay(notas);
  const prev = getStopOperacionMeta(notas);
  const next = { ...prev, ...patch };
  const payload = MARK + JSON.stringify(next);
  return base ? `${base}${payload}` : payload.trimStart();
}

export function getInicioOperacionMs(stop) {
  const iso = getStopOperacionMeta(stop?.notas)?.inicio_operacion_at;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Firma de entrega en parada de descarga (`stops.notas` operativos). */
export function getStopEntregaFirmaMeta(stop) {
  const m = getStopOperacionMeta(stop?.notas);
  if (!m?.entrega_firma_url) return null;
  return {
    stop_id: stop?.id ?? null,
    firma_url: m.entrega_firma_url,
    signed_at: m.entrega_firma_at || null,
    conductor_id: m.entrega_conductor_id || null,
    conductor_nombre: m.entrega_conductor_nombre || null,
    geo: m.entrega_firma_geo || null,
  };
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
  "parte_transporte_id",
  "parte_transporte_tipo",
  "parte_transporte_overrides",
  "cargador_parte_id",
  "dcdt_servicio_id",
  "mercancia",
  "entrega_firma_url",
  "entrega_firma_at",
  "entrega_conductor_id",
  "entrega_conductor_nombre",
  "entrega_firma_geo",
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
    if (!visible.startsWith("{") && !visible.includes(BARE_MARK)) return visible;
  }
  return readableFromOperacionMeta(getStopOperacionMeta(notas));
}
