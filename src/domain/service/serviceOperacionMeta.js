/**
 * Metadatos operativos del servicio embebidos al final de `referencia` (sin columnas nuevas).
 * La parte visible para cliente/ref es la anterior al marcador.
 */

const BARE_MARK = "__SRV_OP__:";
const MARK = "\n" + BARE_MARK;

function findMetaMark(s) {
  const withBreak = s.indexOf(MARK);
  if (withBreak !== -1) return { index: withBreak, length: MARK.length };
  const bare = s.indexOf(BARE_MARK);
  if (bare !== -1) return { index: bare, length: BARE_MARK.length };
  return null;
}

export function stripServicioOperacionDisplay(referencia) {
  if (referencia == null || referencia === "") return "";
  const s = String(referencia);
  const mark = findMetaMark(s);
  if (!mark) return s.trim();
  return s.slice(0, mark.index).trim();
}

function parseMetaFromRef(ref) {
  if (ref == null || ref === "") return {};
  const s = String(ref);
  const mark = findMetaMark(s);
  if (!mark) return {};
  try {
    const o = JSON.parse(s.slice(mark.index + mark.length).trim());
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

export function getOperationalPlanSnapshot(servicio) {
  const plan = getServicioOperacionMeta(servicio).operational_plan;
  return plan && typeof plan === "object" ? plan : null;
}

export function getOperationalEtaSnapshot(servicio) {
  const eta = getServicioOperacionMeta(servicio).operational_eta;
  return eta && typeof eta === "object" ? eta : null;
}

/** ISO string o null: marca que el conductor confirmó explícitamente destino/ruta. */
export function getOperationalPlanConfirmedAt(servicio) {
  const iso = getServicioOperacionMeta(servicio).operational_plan_confirmed_at;
  return typeof iso === "string" && iso.trim() ? iso.trim() : null;
}

export function mergeReferenciaOperacional(referencia, patch) {
  const prev = parseMetaFromRef(referencia);
  const next = { ...prev, ...patch };
  const base = stripServicioOperacionDisplay(referencia || "");
  const payload = MARK + JSON.stringify(next);
  return base ? base + payload : BARE_MARK + JSON.stringify(next);
}
