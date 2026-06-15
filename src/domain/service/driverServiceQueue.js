import {
  SERVICIO_ESTADO_ASIGNADO,
  SERVICIO_ESTADO_COMPLETADO,
  SERVICIO_ESTADO_EN_CURSO,
  SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
} from "../fleet/serviceStatus.js";
import { needsExpedienteClosure } from "./expedienteCierre.js";
import { getStopOperacionMeta, mergeStopOperacionMeta } from "./stopOperacionMeta.js";

/**
 * Prioridad del servicio principal del conductor.
 * `completado` (firma pendiente) va antes que `asignado` para no promover el siguiente
 * mientras el expediente no esté cerrado.
 */
export function estadoRankForDriverQueue(estado) {
  const st = String(estado || "").toLowerCase();
  if (st === SERVICIO_ESTADO_EN_CURSO) return 0;
  if (st === SERVICIO_ESTADO_COMPLETADO) return 1;
  if (st === SERVICIO_ESTADO_ASIGNADO) return 2;
  if (st === SERVICIO_ESTADO_PENDIENTE_ASIGNACION) return 3;
  return 9;
}

/**
 * Momento en que el servicio entró en la cola del conductor (cola FIFO).
 * Fuente fiable: `servicio_asignaciones.created_at` (fila creada al asignar el conductor).
 * Si no hay dato de asignación, se usa `created_at` del servicio como aproximación estable.
 * @param {object} sv
 * @param {Record<string,string>} assignedAtById — servicio_id → ISO de la primera asignación
 * @returns {number} epoch ms (Infinity si no hay ningún timestamp fiable)
 */
export function driverQueueAssignmentTimeMs(sv, assignedAtById = {}) {
  const fromAssign = sv?.id && assignedAtById ? assignedAtById[sv.id] : null;
  const raw = fromAssign ?? sv?.created_at ?? null;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/**
 * Orden de candidatos operativos. Dentro del mismo estado se respeta el ORDEN DE ASIGNACIÓN
 * (FIFO): el servicio asignado antes al conductor va primero.
 * @param {object[]} candidates
 * @param {Record<string,string>} [assignedAtById]
 */
export function sortDriverOperationalCandidates(candidates, assignedAtById = {}) {
  return [...(Array.isArray(candidates) ? candidates : [])].sort((a, b) => {
    const ra = estadoRankForDriverQueue(a?.estado);
    const rb = estadoRankForDriverQueue(b?.estado);
    if (ra !== rb) return ra - rb;
    return (
      driverQueueAssignmentTimeMs(a, assignedAtById) -
      driverQueueAssignmentTimeMs(b, assignedAtById)
    );
  });
}

/**
 * Siguiente servicio en cola FIFO: el primer servicio asignado pendiente (asignado /
 * pendiente_asignacion con conductor) según el momento de asignación al conductor.
 * @param {object[]} candidates — ya filtrados operativos
 * @param {string|null} currentServicioId
 * @param {Record<string,string>} [assignedAtById] — servicio_id → ISO de la primera asignación
 */
export function pickNextAssignedService(candidates, currentServicioId, assignedAtById = {}) {
  const pool = (Array.isArray(candidates) ? candidates : []).filter((sv) => {
    if (!sv?.id || sv.id === currentServicioId) return false;
    const st = String(sv.estado || "").toLowerCase();
    return st === SERVICIO_ESTADO_ASIGNADO || st === SERVICIO_ESTADO_PENDIENTE_ASIGNACION;
  });
  if (!pool.length) return null;
  pool.sort(
    (a, b) =>
      driverQueueAssignmentTimeMs(a, assignedAtById) -
      driverQueueAssignmentTimeMs(b, assignedAtById),
  );
  return pool[0];
}

function mergeStopOperationalGeoFromPrevious(prevStop, nextStop) {
  if (!prevStop?.id || !nextStop?.id || prevStop.id !== nextStop.id) return nextStop;
  const prevMeta = getStopOperacionMeta(prevStop.notas);
  const nextMeta = getStopOperacionMeta(nextStop.notas);
  const patch = {};
  const prevEntradaLat = Number(prevMeta?.entrada_geo?.lat);
  const nextEntradaLat = Number(nextMeta?.entrada_geo?.lat);
  const nextEntradaUnavailable =
    nextMeta?.entrada_geo?.source === "no_disponible" || !Number.isFinite(nextEntradaLat);
  if (Number.isFinite(prevEntradaLat) && nextEntradaUnavailable) {
    patch.entrada_geo = prevMeta.entrada_geo;
  }
  const prevSalidaLat = Number(prevMeta?.salida_geo?.lat);
  const nextSalidaLat = Number(nextMeta?.salida_geo?.lat);
  const nextSalidaUnavailable =
    nextMeta?.salida_geo?.source === "no_disponible" || !Number.isFinite(nextSalidaLat);
  if (Number.isFinite(prevSalidaLat) && nextSalidaUnavailable) {
    patch.salida_geo = prevMeta.salida_geo;
  }
  if (!Object.keys(patch).length) return nextStop;
  return { ...nextStop, notas: mergeStopOperacionMeta(nextStop.notas, patch) };
}

function mergeStopsPreservingRecentGeo(prevStops, nextStops) {
  if (!Array.isArray(nextStops) || !nextStops.length) return nextStops;
  if (!Array.isArray(prevStops) || !prevStops.length) return nextStops;
  const prevById = new Map(prevStops.map((s) => [s.id, s]));
  return nextStops.map((stop) => mergeStopOperationalGeoFromPrevious(prevById.get(stop.id), stop));
}

/**
 * Aplica resolución remota sin desincronizar servicio/paradas ni saltar el cierre documental.
 * @param {{ servicio: object|null, stops: object[], siguienteServicio: object|null, siguientesStops: object[] }} previous
 * @param {{ servicio: object|null, stops: object[], siguienteServicio?: object|null, siguientesStops?: object[] }} resolved
 */
export function mergeDriverActiveViewFromResolution(previous, resolved) {
  const prev = previous && typeof previous === "object" ? previous : {};
  const prevSvc = prev.servicio ?? null;
  const prevStops = Array.isArray(prev.stops) ? prev.stops : [];
  const nextSvc = resolved?.servicio ?? null;
  const nextStops = Array.isArray(resolved?.stops) ? resolved.stops : [];
  const siguienteServicio =
    resolved?.siguienteServicio !== undefined ? resolved.siguienteServicio : (prev.siguienteServicio ?? null);
  const siguientesStops =
    resolved?.siguientesStops !== undefined
      ? Array.isArray(resolved.siguientesStops)
        ? resolved.siguientesStops
        : []
      : Array.isArray(prev.siguientesStops)
        ? prev.siguientesStops
        : [];

  const pinClosure =
    prevSvc?.id &&
    nextSvc?.id &&
    prevSvc.id !== nextSvc.id &&
    needsExpedienteClosure(prevSvc, prevStops);

  if (pinClosure) {
    return {
      servicio: prevSvc,
      stops: prevStops,
      siguienteServicio,
      siguientesStops,
    };
  }

  if (!nextSvc?.id) {
    return {
      servicio: null,
      stops: [],
      siguienteServicio: null,
      siguientesStops: [],
    };
  }

  const sameService = prevSvc?.id === nextSvc.id;
  if (
    sameService &&
    String(prevSvc?.estado || "") === SERVICIO_ESTADO_COMPLETADO &&
    needsExpedienteClosure(prevSvc, prevStops) &&
    String(nextSvc?.estado || "") !== SERVICIO_ESTADO_COMPLETADO &&
    String(nextSvc?.estado || "") !== "cerrado"
  ) {
    return {
      servicio: { ...nextSvc, estado: SERVICIO_ESTADO_COMPLETADO },
      stops: mergeStopsPreservingRecentGeo(
        prevStops,
        nextStops.length ? nextStops : prevStops,
      ),
      siguienteServicio,
      siguientesStops,
    };
  }

  return {
    servicio: nextSvc,
    stops: mergeStopsPreservingRecentGeo(prevStops, nextStops),
    siguienteServicio,
    siguientesStops,
  };
}
