/**
 * Metadatos operativos del servicio embebidos al final de `referencia` (sin columnas nuevas).
 * La parte visible para cliente/ref es la anterior al marcador.
 */

const MARK = "\n__SRV_OP__:";

export function stripServicioOperacionDisplay(referencia) {
  if (referencia == null || referencia === "") return "";
  const s = String(referencia);
  const i = s.indexOf(MARK);
  if (i === -1) return s.trim();
  return s.slice(0, i).trim();
}

function parseMetaFromRef(ref) {
  if (ref == null || ref === "") return {};
  const s = String(ref);
  const i = s.indexOf(MARK);
  if (i === -1) return {};
  try {
    const o = JSON.parse(s.slice(i + MARK.length).trim());
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export function getServicioOperacionMeta(servicio) {
  return parseMetaFromRef(servicio?.referencia);
}

/** ISO string o null */
export function getOperationalTripStartedAt(servicio) {
  const iso = getServicioOperacionMeta(servicio).operational_trip_started_at;
  return typeof iso === "string" && iso.trim() ? iso.trim() : null;
}

export function mergeReferenciaOperacional(referencia, patch) {
  const prev = parseMetaFromRef(referencia);
  const next = { ...prev, ...patch };
  const base = stripServicioOperacionDisplay(referencia || "");
  const payload = MARK + JSON.stringify(next);
  return base ? base + payload : payload.replace(/^\n/, "");
}
