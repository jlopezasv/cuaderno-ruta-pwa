import { getStopOperacionMeta } from "../service/stopOperacionMeta.js";
import { cargadorIdFromStop } from "./dcdtCargadorGroups.js";

export function isDescargaStop(stop) {
  return String(stop?.tipo || "").toLowerCase() === "descarga";
}

export function isCargaStopTipo(stop) {
  return String(stop?.tipo || "").toLowerCase() === "carga";
}

/** cargador de origen de la mercancía en paradas descarga (__CUADERNO_OP__). */
export function cargadorParteIdFromStop(stop) {
  if (!stop) return null;
  const raw = stop.cargador_parte_id ?? getStopOperacionMeta(stop.notas)?.cargador_parte_id;
  return raw ? String(raw) : null;
}

export function collectDistinctCargadorIdsFromStops(stops) {
  const ids = new Set();
  for (const s of stops || []) {
    if (!isCargaStopTipo(s)) continue;
    const cid = cargadorIdFromStop(s);
    if (cid) ids.add(cid);
  }
  return [...ids];
}

/** Opciones para el selector: cargadores ya elegidos en paradas de carga. */
export function cargadorOptionsForDescargaLink(stops, partesCatalog = []) {
  const seen = new Map();
  const sorted = [...(stops || [])].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
  let idx = 0;
  for (const s of sorted) {
    if (!isCargaStopTipo(s)) continue;
    const id = cargadorIdFromStop(s);
    if (!id || seen.has(id)) continue;
    idx += 1;
    const parte = (partesCatalog || []).find((p) => p.id === id);
    const label = parte?.nombre ? String(parte.nombre).trim() : `Carga parada ${idx}`;
    seen.set(id, label);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

/** Resuelve cargador de origen para una descarga (explícito o único cargador del servicio). */
export function resolveDescargaCargadorParteId(stop, stops) {
  const explicit = cargadorParteIdFromStop(stop);
  if (explicit) return explicit;
  const cargadores = collectDistinctCargadorIdsFromStops(stops);
  if (cargadores.length === 1) return cargadores[0];
  return null;
}

/** Auto-vincula descargas cuando solo hay un cargador en el servicio. */
export function normalizeDescargaCargadorLinks(stops) {
  const cargadores = collectDistinctCargadorIdsFromStops(stops);
  if (cargadores.length !== 1) return stops;
  return (stops || []).map((s) => {
    if (!isDescargaStop(s) || cargadorParteIdFromStop(s)) return s;
    return { ...s, cargador_parte_id: cargadores[0] };
  });
}

export function descargaCargadorLinkPending(stop, stops) {
  if (!isDescargaStop(stop)) return false;
  if (cargadorParteIdFromStop(stop)) return false;
  return collectDistinctCargadorIdsFromStops(stops).length >= 2;
}
