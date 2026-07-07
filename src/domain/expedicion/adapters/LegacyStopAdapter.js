import {
  getStopOperacionMeta,
  stripOperacionMetaDisplay,
} from "../../service/stopOperacionMeta.js";

/**
 * Adaptador lectura: fila `stops` → objeto Parada de dominio.
 *
 * @param {Record<string, unknown>|null|undefined} stop
 * @returns {import('../types/expedicion.types.js').Parada|null}
 */
export function toParada(stop) {
  if (!stop || typeof stop !== "object") return null;

  const notas = stop.notas ?? "";
  const meta = getStopOperacionMeta(notas);

  return {
    id: String(stop.id || ""),
    servicioId: String(stop.servicio_id || ""),
    tipo: String(stop.tipo || ""),
    nombre: String(stop.nombre || ""),
    orden: stop.orden != null ? Number(stop.orden) : null,
    notasVisible: stripOperacionMetaDisplay(notas),
    meta,
  };
}

/**
 * @param {Array<Record<string, unknown>>|null|undefined} stops
 * @returns {import('../types/expedicion.types.js').Parada[]}
 */
export function toParadas(stops) {
  if (!Array.isArray(stops)) return [];
  return stops.map(toParada).filter(Boolean);
}
