import { getOperationalTripStartedAt } from "./serviceOperacionMeta.js";
import { sortStopsByOrdenOperacional } from "./stopOperationalOrder.js";

function sortStopsByOrden(stops) {
  return sortStopsByOrdenOperacional(stops);
}

function operationalGroupFromStopTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "carga") return "carga";
  if (t === "descarga") return "descarga";
  if (t.includes("carga") && t.includes("descarga")) return "carga_descarga";
  return "parada_tecnica";
}

function parseTs(v) {
  if (v == null || v === "") return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function parseIsoMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Primera parada de carga por orden.
 */
export function getFirstCargaStop(stopsRaw) {
  const stops = sortStopsByOrden(stopsRaw);
  return stops.find((s) => operationalGroupFromStopTipo(s.tipo) === "carga") || null;
}

/**
 * Inicio operacional del viaje (PR-30): `operational_trip_started_at` en metadatos del servicio.
 * Fallback legacy: salida del primer muelle de carga (datos antiguos sin meta).
 */
export function getOperationalTripStartMs(servicio, stopsRaw) {
  const fromMeta = parseIsoMs(getOperationalTripStartedAt(servicio));
  if (fromMeta != null) return fromMeta;
  const first = getFirstCargaStop(stopsRaw);
  return first ? parseTs(first.hora_salida_real) : null;
}

export function isOperationalTripStarted(servicio, stopsRaw) {
  return getOperationalTripStartMs(servicio, stopsRaw) != null;
}
